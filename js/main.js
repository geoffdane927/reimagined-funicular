import {SplatRenderer} from './renderer.js';
import {VideoSampler} from './video.js';
import {makeWasmModule} from './splats.js';

const $=id=>document.getElementById(id);
const renderer=new SplatRenderer($('gl'));
const sampler=new VideoSampler($('source'),$('frameCanvas'));
let data=new Float32Array(0),videoMeta=null,wasm=null,last=performance.now(),frames=0;

for(const id of ['frames','stride','depth','size']) $(id).addEventListener('input',()=>{$(id+'Out').textContent=$(id).value});

$('videoFile').addEventListener('change',async e=>{
  const file=e.target.files[0];
  if(!file)return;
  videoMeta=null;
  $('source').classList.remove('ready');
  $('status').textContent='Loading video…';
  $('videoInfo').textContent=`Reading ${file.name} and preparing it for splat creation…`;
  try{
    videoMeta=await sampler.load(file);
    $('source').classList.add('ready');
    $('videoInfo').textContent=`✓ ${file.name} loaded · ${videoMeta.width}×${videoMeta.height} · ${videoMeta.duration.toFixed(1)}s · This video will be used to create the splats.`;
    $('status').textContent='Video loaded — ready to create splats';
  }catch(err){
    console.error(err);
    $('source').classList.remove('ready');
    $('videoInfo').textContent='Could not load this video.';
    $('status').textContent='Video error';
    alert(err.message);
  }
});

$('create').onclick=async()=>{
  if(!videoMeta){$('status').textContent='Choose and load a video first';return}
  try{
    $('create').disabled=true;
    $('status').textContent='Using uploaded video…';
    const n=+$('frames').value,stride=+$('stride').value,depth=+$('depth').value;
    data=await sampler.sample(n,stride,depth,(i,total)=>$('status').textContent=`Using video · sampling frame ${i}/${total}…`);
    renderer.setData(data);
    $('count').textContent=renderer.count;
    $('status').textContent=`Created ${renderer.count.toLocaleString()} splats from video`;
  }catch(err){
    console.error(err);
    $('status').textContent='Creation failed';
    alert(err.message);
  }finally{$('create').disabled=false}
};

$('clear').onclick=()=>{data=new Float32Array(0);renderer.setData(data);$('count').textContent='0';$('status').textContent='Cleared'};

$('export').onclick=()=>{
  if(!data.length){$('status').textContent='Nothing to export';return}
  const lines=['ply','format ascii 1.0','element vertex '+data.length/8,'property float x','property float y','property float z','property float scale_x','property float scale_y','property float scale_z','property uchar red','property uchar green','property uchar blue','property uchar alpha','end_header'];
  for(let i=0;i<data.length;i+=8)lines.push(`${data[i]} ${data[i+1]} ${data[i+2]} ${data[i+3]} ${data[i+3]} ${data[i+3]} ${Math.round(data[i+4]*255)} ${Math.round(data[i+5]*255)} ${Math.round(data[i+6]*255)} ${Math.round(data[i+7]*255)}`);
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/plain'}));a.download='video-splats.ply';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
};

async function boot(){try{wasm=await makeWasmModule();console.log('WebAssembly generator loaded')}catch(e){console.warn('WASM fallback unavailable',e)}requestAnimationFrame(loop)}
function loop(t){renderer.render(+$('size').value);if(t-last>500){$('fps').textContent=Math.round(frames*1000/(t-last));frames=0;last=t}frames++;requestAnimationFrame(loop)}
boot();
