import {SplatRenderer} from './renderer.js';
import {VideoSampler} from './video.js';

const $=id=>document.getElementById(id);
const status=(text)=>$('status').textContent=text;

let renderer=null;
let sampler=null;
let data=new Float32Array(0);
let videoMeta=null;
let videoFile=null;
let last=performance.now(),frames=0;

const qualities={
  low:{frames:8,stride:18},
  medium:{frames:16,stride:10},
  high:{frames:32,stride:6},
  ultra:{frames:56,stride:4}
};

function setQuality(){
  const q=qualities[$('quality').value];
  $('qualityInfo').textContent=`${q.frames} frames · every ${q.stride} pixels`;
}

function makePLY(values){
  const count=values.length/8;
  const k=0.28209479177387814;
  const lines=['ply','format ascii 1.0',`element vertex ${count}`,
    'property float x','property float y','property float z',
    'property float scale_0','property float scale_1','property float scale_2',
    'property float rot_0','property float rot_1','property float rot_2','property float rot_3',
    'property float f_dc_0','property float f_dc_1','property float f_dc_2','property float opacity','end_header'];
  for(let i=0;i<values.length;i+=8){
    const x=values[i],y=values[i+1],z=values[i+2],s=Math.max(0.004,values[i+3]);
    const r=Math.max(0.001,Math.min(0.999,values[i+4]));
    const g=Math.max(0.001,Math.min(0.999,values[i+5]));
    const b=Math.max(0.001,Math.min(0.999,values[i+6]));
    const a=Math.max(0.01,Math.min(0.99,values[i+7]));
    lines.push(`${x} ${y} ${z} ${Math.log(s)} ${Math.log(s)} ${Math.log(s)} 1 0 0 0 ${(r-.5)/k} ${(g-.5)/k} ${(b-.5)/k} ${Math.log(a/(1-a))}`);
  }
  return lines.join('\n');
}

async function init(){
  try{
    status('Starting Gaussian renderer…');
    renderer=new SplatRenderer($('gl'));
    sampler=new VideoSampler($('source'),$('frameCanvas'));
    status('Ready — choose a video');
  }catch(err){
    console.error(err);
    status('Renderer failed to start');
    $('videoNotice').textContent='Could not start gsplat.js. Check that WebGL is enabled and that this page can load the gsplat.js module.';
  }
}

for(const id of ['depth','size']) $(id).addEventListener('input',()=>{$(id+'Out').textContent=$(id).value});
$('quality').addEventListener('change',setQuality);
setQuality();

$('videoFile').addEventListener('change',async e=>{
  const file=e.target.files?.[0];
  if(!file)return;
  videoFile=file;
  videoMeta=null;
  $('create').disabled=true;
  $('source').classList.remove('ready');
  $('videoInfo').textContent=`Selected: ${file.name} (${(file.size/1048576).toFixed(1)} MB). Loading…`;
  $('videoNotice').textContent='Loading the selected video now…';
  status('Loading uploaded video…');
  try{
    videoMeta=await sampler.load(file);
    $('source').classList.add('ready');
    $('source').controls=true;
    $('videoInfo').textContent=`✓ ${file.name} · ${videoMeta.width}×${videoMeta.height} · ${videoMeta.duration.toFixed(2)}s`;
    $('videoNotice').textContent='✓ VIDEO LOADED. These frames will be used to create the Gaussian splats.';
    $('create').disabled=false;
    status('Video loaded — choose quality and create splats');
  }catch(err){
    console.error(err);
    $('videoInfo').textContent=`✗ ${file.name} could not be decoded.`;
    $('videoNotice').textContent=`Video error: ${err.message}`;
    status('Video failed to load');
  }
});

$('create').onclick=async()=>{
  if(!renderer||!sampler||!videoMeta){status('Choose a video first');return;}
  try{
    $('create').disabled=true;
    const q=qualities[$('quality').value];
    status(`Reading video · ${q.frames} frames…`);
    data=await sampler.sample(q.frames,q.stride,+$('depth').value,(i,total)=>status(`${$('quality').value.toUpperCase()} · reading video frame ${i}/${total}…`));
    status('Converting sampled video data to Gaussian PLY…');
    const ply=makePLY(data);
    await renderer.setPLY(ply,data.length/8);
    $('count').textContent=(data.length/8).toLocaleString();
    status(`Done — ${$('count').textContent} Gaussian splats created from your video`);
  }catch(err){
    console.error(err);
    status('Splat creation failed');
    $('videoNotice').textContent=`Creation error: ${err.message}`;
  }finally{$('create').disabled=!videoMeta;}
};

$('clear').onclick=()=>{data=new Float32Array(0);renderer?.clear();$('count').textContent='0';status('Cleared')};
$('export').onclick=()=>{
  if(!data.length){status('Nothing to export');return;}
  const blob=new Blob([makePLY(data)],{type:'text/plain'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='video-splats.ply';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};

function loop(t){if(renderer)renderer.render();if(t-last>500){$('fps').textContent=Math.round(frames*1000/(t-last));frames=0;last=t}frames++;requestAnimationFrame(loop)}
init().then(()=>requestAnimationFrame(loop));
