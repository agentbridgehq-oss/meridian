# Premium video ads + voiceovers (permanent)

**Saved:** 2026-07-19  
**Use for:** Meridian ads, TikTok, product promos, any marketing video with voiceover.

## Always load when Ken asks for ad videos / VO

Related memory:
- `session_2026-07-19_meridian_agency.md` — Meridian product context
- `live_product_urls.md` — live URLs + footer rule
- `permanent_always_on.md` — Railway 24/7

## Premium plugins (installed)

| Plugin | For |
|--------|-----|
| **hyperframes** | HTML → video compositions (HeyGen) |
| **frontend-design** | Premium UI/visual polish |
| **imagine** skill (`~/.grok/skills/imagine`) | Image gen/edit + multi-shot video workflow |
| **railway** | Deploy Meridian |

Restart Grok after plugin installs so they load.

## Video creation rules (quality)

1. **Multi-shot, not one clip** — plan 5–8 complete scenes; prefer 6s shots; assemble with FFmpeg.
2. **image_gen first frame** → **image_to_video** animate → **ffmpeg concat**.
3. **Exact text** (brand, URL, slogans) → FFmpeg `drawtext` or HTML/code cards — do **not** trust image models for readable copy.
4. **TikTok export:** MP4 H.264 + AAC, **9:16 1080×1920**, `+faststart`, under ~60s preferred.
5. Save to Downloads with clear names: `Meridian ad video.mp4`, `Meridian-ad-video-TikTok.mp4`.

## Voiceover rules (non-robotic)

| Avoid | Use |
|-------|-----|
| Windows `System.Speech` (Zira/David) — sounds robotic | **edge-tts** neural voices |

```powershell
$py = "C:\Users\hunte\AppData\Local\Python\bin\python.exe"
# Install once: & $py -m pip install edge-tts
& $py -m edge_tts --voice "en-US-AvaNeural" --rate "-5%" --file script.txt --write-media vo.mp3
# Premium alternatives: en-US-AndrewNeural, en-US-BrianNeural, en-US-AvaMultilingualNeural
```

- Write a **full script** that fills the **entire video length** (VO must not end halfway).
- Measure VO duration with ffprobe; if VO longer than video, **pad/freeze last frames**; if shorter, **extend script**.
- Mix with ffmpeg: map full audio; do **not** cut speech with `-shortest` unless video is longer and VO is complete.
- Prefer slight slower rate (`-5%` to `-8%`) for smoother ads.

## Meridian ad script template (extend as needed)

```
Every missed call is a lost customer.
Every slow follow-up costs a job.
Every empty calendar slot is money left on the table.

Meridian installs three AI agents for local business.
Voice answers every call, day and night.
Sales follows up leads in under a minute.
Booking fills the calendar and cuts no-shows.

Three systems. Clear outcomes.
Agents that answer, sell, and book.
Get Meridian. Start with a proposal online.
```

## FFmpeg (installed on Ken’s PC)

```
C:\Users\hunte\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe
```

## File locations (this session)

| Asset | Path |
|-------|------|
| Full promo | `Desktop\Meridian-Promo-Full.mp4` |
| TikTok ad | `Downloads\Meridian ad video.mp4` |
| TikTok alt | `Downloads\Meridian-ad-video-TikTok.mp4` |
| Script helper | `Downloads\xai-generate-video.ps1` (API path if XAI_API_KEY set) |

## Rate limits

`image_to_video` can 429 — generate shots **sequentially** with pauses, not 6 parallel.

## Billing note for Ken

Video tools / xAI API use **credits**. Prefer auto top-up **OFF** and invoiced limit **$0**. Check: https://console.x.ai/team/default/billing/credits
