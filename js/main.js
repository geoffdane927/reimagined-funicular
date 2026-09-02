import {SplatRenderer} from './renderer.js';
import {VideoSampler} from './video.js';
import {makeWasmModule} from './splats.js';

const $=id=>document.getElementById(id);
const renderer=new SplatRenderer($('gl'));
const sampler=new VideoSampler($('source'),$('frameCanvas'));
let data=new Float32Array(0),videoMeta=null,wasm=null,last=performance.now(),frames=0;

const qualities={
  low:{frames:10,stride:16,depth:5},
  medium:{frames:24,stride:8,depth:6},
  high:{frames:48,stride:5,depth:7},
  ultra:{frames:80,stride:3,depth:8}
};

for(const id of ['frames','stride','depth','size']) $(id).addEventListener('input',()=>{$(id+'Out').textContent=$(id).value});
$('quality').addEventListener('change',()=>{
  const q=qualities[$('quality').value];
  $('frames').value=q.frames;$('framesOut').textContent=q.frames;
  $('stride').value=q.stride;$('strideOut').textContent=q.stride;
  $('depth').value=q.depth;$('depthOut').textContent=q.depth.toFixed(1);
  $('status').textContent=`${$('quality').selectedOptions[0].textContent} selected`;
});

$('videoFile').addEventListener('change',async e=>{
  const file=e.target.files[0];
  if(!file)return;
  videoMeta=null;$('source').classList.remove('ready');
  $('status').textContent='Loading video…';
  $('videoInfo').textContent=`Reading ${file.name}…`;
  try{
    videoMeta=await sampler.load(file);
    $('source').classList.add('ready');
    $('source').load();
    $('videoInfo').textContent=`✓ ${file.name} loaded · ${videoMeta.width}×${videoMeta.height} · ${videoMeta.duration.toFixed(1)}s`;
    $('videoNotice').textContent='✓ This video is loaded and will be used as the source for the splats.';
    $('status').textContent='Video loaded — choose quality, then Create splats';
  }catch(err){
    console.error(err);$('source').classList.remove('ready');
    $('videoInfo').textContent='Could not load this video.';
    $('videoNotice').textContent='Video could not be loaded.';
    $('status').textContent='Video error';alert(err.message);
  }
});

$('create').onclick=async()=>{
  if(!videoMeta){$('status').textContent='Choose and load a video first';return}
  try{
    $('create').disabled=true;$('status').textContent=`Using uploaded video (${$('quality').value})…`;
    const n=+$('frames').value,stride=+$('stride').value,depth=+$('depth').value;
    data=await sampler.sample(n,stride,depth,(i,total)=>$('status').textContent=`${$('quality').value.toUpperCase()} quality · video frame ${i}/${total}…`);
    renderer.setData(data);$('count').textContent=renderer.count;
    $('status').textContent=`Created ${renderer.count.toLocaleString()} splats from video`;
  }catch(err){console.error(err);$('status').textContent='Creation failed';alert(err.message)}
  finally{$('create').disabled=false}
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
