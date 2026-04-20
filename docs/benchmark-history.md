# Strandspace Benchmark History

Generated: 2026-04-20T06:00:16.783Z
Database: `data\strandspace.sqlite`
Runs: 15

## Summary

- Avg local recall latency: 69.6 ms
- Avg assist round-trip latency: 6958.1 ms
- Avg speedup: 113.9x

## By Model

| provider | model | runs | avgLocalMs | avgAssistMs | avgSpeedup |
| --- | --- | ---: | ---: | ---: | ---: |
| OpenAI Assist | gpt-5.4-mini-2026-03-17 | 13 | 70.7 | 5471.5 | 89.1 |
| OpenAI Assist | gpt-5.2-2025-12-11 | 1 | 75.6 | 17481.2 | 231.2 |
| OpenAI Assist | gpt-5.4-2026-03-05 | 1 | 49.3 | 15760.9 | 319.5 |

## Recent Runs

| createdAt | testLabel | provider | model | mode | prompt | compactPrompt | localMs | assistMs | speedup | faster |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |
| 2026-04-20T05:25:57.731Z | Manual benchmark | OpenAI Assist | gpt-5.4-mini-2026-03-17 | compare | Bose T8S band Shure SM58 acoustic guitar Electric Guitars Mic'd Amp w/ SM57 small setup | Recall Bose T8S acoustic guitar. | 68.8 | 4976.6 | 72.3 | strandbase |
| 2026-04-20T05:06:20.790Z | Fewer cue words benchmark | OpenAI Assist | gpt-5.4-mini-2026-03-17 | compare | Recall Bose T8S acoustic guitar | Recall Bose T8S acoustic guitar | 69.4 | 4607.2 | 66.3 | strandbase |
| 2026-04-20T04:56:47.347Z | local benchmark run 3 | OpenAI Assist | gpt-5.4-mini-2026-03-17 | compare | What is a safe feedback-control starting point for a small karaoke room? | Recall best starting behringer xenyx qx1202usb vocal. | 50.8 | 3710.6 | 73.1 | strandbase |
| 2026-04-20T04:56:43.457Z | local benchmark run 2 | OpenAI Assist | gpt-5.4-mini-2026-03-17 | compare | How should I set gain staging for a Yamaha MG10XU? | Recall Yamaha MG10XU microphone. | 39.2 | 4236.4 | 107.9 | strandbase |
| 2026-04-20T04:56:39.022Z | local benchmark run 1 | OpenAI Assist | gpt-5.4-mini-2026-03-17 | compare | What is a good handheld vocal EQ setup for karaoke? | What is a good handheld vocal EQ setup for karaoke? | 82 | 4700.4 | 57.3 | strandbase |
| 2026-04-20T04:56:14.692Z | karaoke vocal benchmark 1 | OpenAI Assist | gpt-5.4-mini-2026-03-17 | compare | What is a good handheld vocal EQ setup for karaoke? | What is a good handheld vocal EQ setup for karaoke? | 74.7 | 7526.4 | 100.8 | strandbase |
| 2026-04-20T04:51:29.912Z | Manual benchmark | OpenAI Assist | gpt-5.4-mini-2026-03-17 | compare | Bose T8S band Shure SM58 acoustic guitar Electric Guitars Mic'd Amp w/ SM57 small setup | Recall Bose T8S acoustic guitar. | 43.2 | 4838.2 | 112.1 | strandbase |
| 2026-04-20T02:09:31.560Z | Fewer cue words benchmark | OpenAI Assist | gpt-5.4-mini-2026-03-17 | compare | Recall Bose T8S acoustic guitar | Recall Bose T8S acoustic guitar | 55 | 4840 | 87.9 | strandbase |
| 2026-04-20T02:09:11.631Z | Manual benchmark | OpenAI Assist | gpt-5.4-mini-2026-03-17 | compare | Bose T8S band Shure SM58 acoustic guitar Electric Guitars Mic'd Amp w/ SM57 small setup | Recall Bose T8S acoustic guitar. | 55 | 4404.2 | 80.1 | strandbase |
| 2026-04-20T01:28:48.521Z | Manual model lab compare | OpenAI Assist | gpt-5.4-2026-03-05 | compare | Bose T8S karaoke Innopaw WM333 full gain-staging reset with MDX-2600 and mixed mains/monitors | Recall bose t8s karaoke innopaw wm333 full. | 49.3 | 15760.9 | 319.5 | strandbase |
| 2026-04-20T01:24:42.281Z | Manual model lab compare | OpenAI Assist | gpt-5.2-2025-12-11 | compare | Bose T8S karaoke Innopaw WM333 full gain-staging reset with MDX-2600 and mixed mains/monitors | Recall bose t8s karaoke innopaw wm333 full. | 75.6 | 17481.2 | 231.2 | strandbase |
| 2026-04-19T21:45:30.303Z | Manual benchmark | OpenAI Assist | gpt-5.4-mini-2026-03-17 | compare | Bose T8S karaoke Innopaw WM333 full gain-staging reset with MDX-2600 and mixed mains/monitors | Recall bose t8s karaoke innopaw wm333 full. | 207.4 | 6286.6 | 30.3 | strandbase |
| 2026-04-19T21:43:32.251Z | Manual model lab compare | OpenAI Assist | gpt-5.4-mini-2026-03-17 | compare | Bose T8S karaoke Innopaw WM333 full gain-staging reset with MDX-2600 and mixed mains/monitors | Recall bose t8s karaoke innopaw wm333 full. | 51.9 | 8752.7 | 168.7 | strandbase |
| 2026-04-19T21:38:57.241Z | Post-fix live compare | OpenAI Assist | gpt-5.4-mini-2026-03-17 | compare | What is a good t8s sm58 mic setting for karaoke? | Recall Bose T8S microphone for karaoke vocal. | 58.6 | 5632.9 | 96.1 | strandbase |
| 2026-04-19T21:37:13.881Z | Live debug compare | OpenAI Assist | gpt-5.4-mini-2026-03-17 | compare | What is my gallery interview key light setup with the softbox at 45 degrees? | Recall Bose T8S microphone for karaoke vocal. | 63.1 | 6617.8 | 104.9 | strandbase |

## Notes

- This report is generated from the local SQLite table `benchmark_reports` (Model Lab reports).
- If `assistMs` is `n/a`, the run likely occurred in local-only mode or usage was unavailable.

