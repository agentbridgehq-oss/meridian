import dns from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';

export function isPublicAddress(ip) {
  if (net.isIP(ip) === 4) {
    const [a,b,c] = ip.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || b === 88 || (b === 2 && c === 0))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }
  return net.isIP(ip) === 6 && /^[23][0-9a-f]{3}:/i.test(ip) && !/^2001:(?:0*:|db8:|1[0-9a-f]:|2[0-9a-f]:)/i.test(ip) && !/^2002:/i.test(ip) && !/^3fff:/i.test(ip);
}
export function websiteUrl(raw) {
  const u = new URL(/^https?:\/\//i.test(String(raw)) ? raw : `https://${raw}`);
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443') || net.isIP(u.hostname.replace(/[\[\]]/g,'')) || !u.hostname.includes('.') || /\.(local|internal|localhost|test|invalid)$/.test(u.hostname)) throw new Error('Enter a public HTTPS business website without credentials or a custom port.');
  u.hash = ''; u.search = ''; return u;
}
/** HTTPS requests pin the validated DNS address; every redirect is validated again. */
export async function fetchPublicPage(raw, { lookup = dns.lookup, request = https.request } = {}) {
  let url = websiteUrl(raw); const start = Date.now();
  for (let hop = 0; hop < 4; hop++) {
    const addresses = await Promise.race([lookup(url.hostname, { all:true }), new Promise((_,reject) => { const timer=setTimeout(()=>reject(new Error('DNS timeout')),4000);timer.unref?.(); })]);
    if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) throw new Error('Website address is not publicly reachable.');
    const pinned = addresses[0];
    const response = await new Promise((resolve,reject) => {
      const req = request(url, { method:'GET', agent:false, headers:{'User-Agent':'MeridianWebsiteAnalyzer/1.0','Accept':'text/html','Accept-Encoding':'identity'}, lookup:(_host,options,cb) => cb(null, options.all ? [pinned] : pinned.address, pinned.family) }, res => {
        const chunks=[];let bytes=0;
        res.on('data', chunk => { bytes += chunk.length; if(bytes>512000) {res.destroy();reject(new Error('Page exceeds the analysis size limit.'));} else chunks.push(chunk); });
        res.on('error',reject); res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,html:Buffer.concat(chunks).toString('utf8'),bytes}));
      });
      const deadline=setTimeout(()=>req.destroy(new Error('Website timed out.')),10000);deadline.unref?.();
      req.on('close',()=>clearTimeout(deadline));req.setTimeout(8000,()=>req.destroy(new Error('Website timed out.')));req.on('error',reject);req.end();
    });
    if ([301,302,303,307,308].includes(response.status)) { if(!response.headers.location) throw new Error('Invalid redirect.');url=websiteUrl(new URL(response.headers.location,url).href);continue; }
    if(response.status<200 || response.status>=300) throw new Error(`Website returned HTTP ${response.status}.`);
    if(!/text\/html|application\/xhtml\+xml/i.test(response.headers['content-type']||'')) throw new Error('The website did not return an HTML page.');
    return {...response,url:url.href,elapsedMs:Date.now()-start};
  }
  throw new Error('Too many website redirects.');
}
const strip = s => s.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
export function analyzePage(page) {
  const html = page.html;
  const tags = [...html.matchAll(/<meta\b[^>]*>/gi)].map(m=>m[0]);
  const findings=[];
  const add=(id,title,evidence,service,priority,fix)=>findings.push({id,title,evidence,service,priority,fix,sourceUrl:page.url,confidence:'observed in returned HTML'});
  const title=strip(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'');
  if(!title) add('title','Missing page title','No non-empty title element found.','search','high','Write a specific service and location title.');
  if(!tags.some(t=>/name\s*=\s*['"]description['"]/i.test(t)&&/content\s*=\s*['"][^'"]+/i.test(t))) add('description','Missing search description','No non-empty description meta tag found.','search','medium','Add a useful description aligned with the page offer.');
  if(!tags.some(t=>/name\s*=\s*['"]viewport['"]/i.test(t))) add('viewport','Mobile viewport not found','No viewport meta tag found.','web','high','Configure the viewport and verify the mobile layout.');
  const h1s=[...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
  if(h1s.length!==1) add('heading','Main heading needs review',`${h1s.length} H1 elements found. This is a structure review, not a ranking penalty.`, 'web','medium','Create a clear primary heading for the business offer.');
  if(!/<link\b[^>]*rel\s*=\s*['"]canonical['"]/i.test(html)) add('canonical','Canonical signal not found','No canonical link found in returned HTML.','search','medium','Review duplicate-page handling and add the correct canonical where needed.');
  const imgs=[...html.matchAll(/<img\b[^>]*>/gi)];const missingAlt=imgs.filter(m=>! /\balt\s*=/i.test(m[0])).length;
  if(missingAlt) add('image-alt','Images need accessibility review',`${missingAlt} of ${imgs.length} image elements lack an alt attribute.`, 'web','medium','Add useful alternative text or mark decorative images appropriately.');
  const visible=strip(html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,''));
  if(!/<form\b|href\s*=\s*['"](?:mailto:|tel:)/i.test(html)&&!/(book|contact|quote|enquir|schedule)/i.test(visible)) add('conversion','Enquiry path needs review','No form, telephone/email link or common enquiry label found in returned HTML.','revenue-ops','high','Build a visible enquiry path connected to ownership and follow-up.');
  if(tags.some(t=>/noindex/i.test(t))) add('indexing','Indexing restriction detected','A meta tag includes noindex; this may be intentional.','search','high','Confirm the indexing intent before making changes.');
  const order={high:0,medium:1};findings.sort((a,b)=>order[a.priority]-order[b.priority]);
  const contacts=[...html.matchAll(/href\s*=\s*['"]((?:mailto:|tel:)[^'"]+)['"]/gi)].slice(0,12).map(m=>({type:m[1].toLowerCase().startsWith('mailto:')?'email':'phone',value:m[1].replace(/^(mailto:|tel:)/i,'').split('?')[0].slice(0,200),sourceUrl:page.url}));
  return {contacts,url:page.url,title:title.slice(0,200),analyzedAt:new Date().toISOString(),findings,metrics:{htmlBytes:page.bytes,h1Count:h1s.length,imageCount:imgs.length,fetchElapsedMs:page.elapsedMs},limits:['One returned HTML page, without JavaScript rendering.','No measured rankings, traffic, conversion rate, revenue loss or Core Web Vitals.','CRM, follow-up, phone and booking performance require business intake.'],discoveryQuestions:['Where do enquiries slow down?','Which CRM and calendar do you use?','Who owns follow-up and exception handling?']};
}
