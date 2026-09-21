import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [beforePath, afterPath, outputPath, beforeLabel = 'Baseline', afterLabel = 'Updated'] = process.argv.slice(2);
if (!beforePath || !afterPath || !outputPath) {
  console.error('Usage: node scripts/build-approval-comparison.mjs <before-test-results> <after-test-results> <output.html> [before-label] [after-label]');
  process.exit(1);
}

const variants = [
  ['initial-350', '350 × 600'], ['initial-380', '380 × 600'],
  ['expanded', 'Expanded details'], ['attention', 'Attention'],
  ['signers', 'Signing addresses'],
  ['large-text', '200% text'], ['text-spacing', 'Text spacing'],
];
const knownSuffixes = variants.filter(([key]) => key !== 'expanded').map(([key]) => key);
const entries = new Map();
for (const [side, directory] of [['before', beforePath], ['after', afterPath]]) {
  for (const folder of ['approval-gallery', 'marketplace-gallery']) {
    const images = await readdir(path.join(directory, folder));
    for (const filename of images.filter(name => name.endsWith('.png')).sort()) {
      const stem = filename.slice(0, -4);
      const variant = knownSuffixes.find(suffix => stem.endsWith(`-${suffix}`)) ?? 'expanded';
      const name = variant === 'expanded' ? stem : stem.slice(0, -(variant.length + 1));
      const key = `${folder}/${name}`;
      if (!entries.has(key)) entries.set(key, {
        key, name, group: folder === 'marketplace-gallery' ? 'Marketplace' :
          name.startsWith('psbt-') ? 'PSBT' : /^(connect|message)-/.test(name) ? 'Connection & message' : 'Transaction',
        before: {}, after: {},
      });
      const bytes = await readFile(path.join(directory, folder, filename));
      entries.get(key)[side][variant] = `data:image/png;base64,${bytes.toString('base64')}`;
    }
  }
}
const screens = [...entries.values()].filter(entry => entry.before['initial-350'] || entry.after['initial-350'])
  .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
if (!screens.length) throw new Error('No initial approval screenshots found');
const data = JSON.stringify({ screens, variants, beforeLabel, afterLabel }).replaceAll('<', '\\u003c');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>XCP Wallet · Approval comparison</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f4f5f7;color:#172033;font:14px/1.5 system-ui,sans-serif}
header{background:#fff;border-bottom:1px solid #dfe3e8;padding:20px 28px}h1{font-size:22px;line-height:1.3;margin:0 0 5px;font-weight:650}
p{margin:0;color:#586174}main{max-width:1060px;margin:24px auto;padding:0 20px}.controls{display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin-bottom:18px}
label{display:grid;gap:5px;font-size:12px;color:#586174}select,button,input{font:inherit;color:#172033;background:#fff;border:1px solid #cbd2dd;border-radius:7px;padding:9px 12px;min-height:40px}
select{max-width:100%}button{cursor:pointer}button:disabled{opacity:.45;cursor:default}button:hover:enabled{border-color:#155eef}button:focus-visible,select:focus-visible{outline:3px solid #84adff;outline-offset:2px}
.screen-picker{flex:1;min-width:230px}.meta{display:flex;justify-content:space-between;gap:12px;align-items:baseline;margin-bottom:16px}.meta h2{font-size:17px;margin:0;font-weight:600;overflow-wrap:anywhere}#position{color:#667085;white-space:nowrap}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start}.side{min-width:0;display:grid;justify-items:center}.caption{width:100%;display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;color:#586174}.caption strong{font-size:14px;color:#172033}
.frame{background:white;border:1px solid #dfe3e8;border-radius:9px;overflow:hidden;box-shadow:0 2px 7px #1720330b;max-width:100%;min-height:100px}.frame img{display:block;max-width:100%;height:auto}.missing{padding:32px 20px;color:#667085;max-width:380px}.footnote{margin:18px 0 30px;font-size:12px;color:#667085;max-width:800px}
.sheet{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.sheet article{background:#fff;padding:12px}.sheet h2{font-size:14px;margin:0 0 8px}.sheet .pair{gap:10px}.sheet .frame{border-radius:0}.sheet .caption{font-size:11px}
body.sheet-mode main{max-width:1600px}body.sheet-mode header{padding:12px 24px}body.sheet-mode .controls,body.sheet-mode .meta,body.sheet-mode #pair,body.sheet-mode .footnote{display:none}
@media(max-width:650px){header{padding:16px}main{padding:0 12px}.pair{gap:10px}.caption{display:block;font-size:11px}.meta{display:block}.controls{gap:8px}}
</style></head><body>
<header><h1>XCP Wallet approval comparison</h1><p>Matching screens, dimensions, and review states</p></header>
<main><div class="controls">
<label>Group<select id="group" aria-label="Group"><option value="">All screens</option></select></label>
<label class="screen-picker">Screen<select id="screen" aria-label="Screen"></select></label>
<label>View<select id="variant" aria-label="View"></select></label>
<button id="previous" aria-label="Previous screen">← Previous</button><button id="next" aria-label="Next screen">Next →</button>
</div><div class="meta"><h2 id="title"></h2><span id="position"></span></div>
<div class="pair" id="pair"></div><div class="sheet" id="sheet"></div>
<p class="footnote">Initial views use matching popup dimensions. Expanded captures show supporting evidence separately; their tall trailing space is a capture artifact. Enlarged-text and spacing views reveal layout behavior. A missing side means that state was not captured there, including the new successful retry state. Fixtures use test wallets and mocked network evidence; wallet addresses differ between runs.</p>
</main><script type="application/json" id="gallery-data">${data}</script>
<script>
const data=JSON.parse(document.getElementById('gallery-data').textContent);
const group=document.getElementById('group'),screen=document.getElementById('screen'),variant=document.getElementById('variant');
const pair=document.getElementById('pair'),position=document.getElementById('position'),title=document.getElementById('title');
const previous=document.getElementById('previous'),next=document.getElementById('next');
let filtered=data.screens;
function option(value,label){const item=document.createElement('option');item.value=value;item.textContent=label;return item;}
for(const name of [...new Set(data.screens.map(item=>item.group))])group.append(option(name,name));
for(const [key,label] of data.variants)variant.append(option(key,label));
function side(entry,which,view){
  const container=document.createElement('section');container.className='side';
  const caption=document.createElement('div');caption.className='caption';
  const strong=document.createElement('strong');strong.textContent=which==='before'?'Before':'After';caption.append(strong);
  const tag=document.createElement('span');tag.textContent=which==='before'?data.beforeLabel:data.afterLabel;caption.append(tag);container.append(caption);
  const frame=document.createElement('div');frame.className='frame';
  const source=entry[which][view];
  if(source){const img=document.createElement('img');img.src=source;img.alt=(which==='before'?'Before: ':'After: ')+entry.name+' — '+view;frame.append(img);}
  else{const missing=document.createElement('p');missing.className='missing';missing.textContent='No matching capture for this state.';frame.append(missing);}
  container.append(frame);return container;
}
function render(){
  const index=Math.max(0,filtered.findIndex(item=>item.key===screen.value)),entry=filtered[index];if(!entry)return;
  screen.value=entry.key;title.textContent=entry.name;position.textContent=(index+1)+' / '+filtered.length;
  for(const item of variant.options)item.disabled=!entry.before[item.value]&&!entry.after[item.value];
  if(variant.selectedOptions[0].disabled)variant.value='initial-350';
  pair.replaceChildren(side(entry,'before',variant.value),side(entry,'after',variant.value));
  previous.disabled=index===0;next.disabled=index===filtered.length-1;
}
function regroup(){const selected=screen.value;filtered=data.screens.filter(item=>!group.value||item.group===group.value);screen.replaceChildren(...filtered.map(item=>option(item.key,item.name)));if(filtered.some(item=>item.key===selected))screen.value=selected;render();}
group.addEventListener('change',regroup);screen.addEventListener('change',render);variant.addEventListener('change',render);
previous.addEventListener('click',()=>{screen.selectedIndex=Math.max(0,screen.selectedIndex-1);render();});
next.addEventListener('click',()=>{screen.selectedIndex=Math.min(filtered.length-1,screen.selectedIndex+1);render();});
regroup();
const params=new URLSearchParams(location.search);
if(params.has('sheet')){
  document.body.classList.add('sheet-mode');
  const start=Math.max(0,Number(params.get('start'))||0),count=Math.min(8,Math.max(1,Number(params.get('count'))||6));
  const items=data.screens.filter(item=>!params.get('group')||item.group===params.get('group')).slice(start,start+count);
  const sheet=document.getElementById('sheet');
  for(const entry of items){const article=document.createElement('article'),heading=document.createElement('h2'),row=document.createElement('div');heading.textContent=entry.name;row.className='pair';row.append(side(entry,'before','initial-350'),side(entry,'after','initial-350'));article.append(heading,row);sheet.append(article);}
}
</script></body></html>`;
await mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
await writeFile(outputPath, html, 'utf8');
console.log(`Created ${path.resolve(outputPath)} with ${screens.length} screens.`);
