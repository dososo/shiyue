#!/usr/bin/env node
/* 拾月 · 把 record-demo.js 录下的素材剪成成片:各片段交叉淡化拼接,铺上配乐,首尾淡入淡出。
 * 用法: node tools/cut-demo.js <素材目录> <输出.mp4>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const REC = path.resolve(process.argv[2] || 'rec'), OUT = path.resolve(process.argv[3] || 'demo.mp4');
const { marks } = JSON.parse(fs.readFileSync(path.join(REC, 'marks.json'), 'utf8'));
const XF = 0.45, FPS = 30;
const segs = marks.map(m => ({ name: m.name, in: m.in, dur: m.out - m.in }));
const inputs = [], filters = [];
segs.forEach((s, i) => {
  inputs.push('-ss', s.in.toFixed(3), '-t', s.dur.toFixed(3), '-i', path.join(REC, 'raw.webm'));
  filters.push(`[${i}:v]fps=${FPS},scale=1280:720:flags=lanczos,format=yuv420p,setpts=PTS-STARTPTS[v${i}]`);
});
let prev = 'v0', t = segs[0].dur;
for (let i = 1; i < segs.length; i++) {
  const o = `x${i}`;
  filters.push(`[${prev}][v${i}]xfade=transition=fade:duration=${XF}:offset=${(t - XF).toFixed(3)}[${o}]`);
  t += segs[i].dur - XF; prev = o;
}
const total = t, ai = segs.length;
filters.push(`[${prev}]fade=t=in:st=0:d=0.6,fade=t=out:st=${(total - 0.9).toFixed(3)}:d=0.9[vout]`);
filters.push(`[${ai}:a]atrim=start=1.5:duration=${total.toFixed(3)},asetpts=PTS-STARTPTS,volume=5dB,afade=t=in:st=0:d=1.2,afade=t=out:st=${(total - 2.4).toFixed(3)}:d=2.4[aout]`);
execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-i', path.join(REC, 'music.webm'),
  '-filter_complex', filters.join(';'), '-map', '[vout]', '-map', '[aout]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', total.toFixed(3), OUT], { stdio: 'inherit' });
console.log('成片时长', total.toFixed(2) + 's', '→', OUT);
