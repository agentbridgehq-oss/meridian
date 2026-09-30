import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { publicVoiceConnections } from '../lib/voice-connections.mjs';

const workflow=JSON.parse(readFileSync(new URL('../n8n/meridian-calendar-receptionist.json',import.meta.url),'utf8'));
const code=name=>workflow.nodes.find(n=>n.name===name).parameters.jsCode;
const run=(name,input,nodes={})=>vm.runInNewContext(`(function(){${code(name)}})()`,{$json:input,$:name=>({first:()=>({json:nodes[name]})}),URL,Date});
const request={version:1,deploymentId:'dep_test',idempotencyKey:'test_request_1',action:'book_appointment',data:{callerName:'Test Caller',service:'Consultation',startTime:'2026-10-01T14:00:00-04:00',timezone:'America/Toronto',callerConfirmedSlot:true}};

test('connection status never exposes secret values or customer records',()=>{
  const before=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-secret-must-stay-private';
  try{const result=publicVoiceConnections();assert.equal(result.browser.toolsEnabled,false);assert.equal(result.phone.liveCallVerified,null);assert.equal(JSON.stringify(result).includes('test-secret-must-stay-private'),false);assert.equal('deployments' in result,false);assert.equal('clients' in result,false);assert.equal(result.roles.length,4);}finally{if(before===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=before;}
});

test('importable calendar bridge has authenticated ingress and no configured secrets',()=>{
  assert.equal(workflow.active,false);assert.equal(workflow.nodes.find(n=>n.name==='Calendar Webhook').parameters.authentication,'headerAuth');
  assert.equal(workflow.nodes.find(n=>n.name==='Verified Calendar Adapter').parameters.genericAuthType,'httpHeaderAuth');
  assert.equal(workflow.nodes.find(n=>n.name==='Configure Adapter URL').parameters.assignments.assignments[0].value,'');
  assert.equal(workflow.settings.saveDataSuccessExecution,'none');
  const publicCopy=JSON.parse(readFileSync(new URL('../public/workflows/meridian-calendar-receptionist.json',import.meta.url),'utf8'));assert.deepEqual(publicCopy,workflow);
});

test('calendar bridge rejects missing adapter, HTTP adapter and unconfirmed booking',()=>{
  for(const [endpoint,body,code] of [['',request,'adapter_not_configured'],['http://example.com',request,'unsafe_adapter_url'],['https://example.com',{...request,data:{...request.data,callerConfirmedSlot:false}},'slot_not_confirmed']]){
    const result=run('Validate Calendar Request',{adapterUrl:endpoint},{'Calendar Webhook':{body}})[0].json;
    assert.equal(result.valid,false);assert.equal(result.result.confirmed,false);assert.equal(result.result.code,code);
  }
});

test('caller cannot redirect the calendar bridge to an arbitrary endpoint',()=>{
  const result=run('Validate Calendar Request',{adapterUrl:'https://verified.example.com/calendar'},{'Calendar Webhook':{body:{...request,endpoint:'https://caller.example.com'}}})[0].json;
  assert.equal(result.valid,true);assert.equal(result.endpoint,'https://verified.example.com/calendar');
});

test('calendar bridge only confirms explicit successful downstream results',()=>{
  const nodes={'Validate Calendar Request':{request}};
  for(const response of [{statusCode:500,body:{ok:true,confirmed:true}},{statusCode:200,body:{ok:true}},{error:'timeout'}, {statusCode:200,body:{ok:true,confirmed:false}}]){
    const result=run('Require Calendar Confirmation',response,nodes)[0].json;assert.equal(result.statusCode,502);assert.equal(result.result.confirmed,false);
  }
  const result=run('Require Calendar Confirmation',{statusCode:200,body:{ok:true,confirmed:true,bookingId:'event_1',secret:'must-not-leak'}},nodes)[0].json;
  assert.equal(result.statusCode,200);assert.equal(result.result.bookingId,'event_1');assert.equal('secret' in result.result,false);
});
