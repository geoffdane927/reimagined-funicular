import {VideoSampler} from './video.js';

const $=id=>document.getElementById(id);
const status=text=>{const el=$('status');if(el)el.textContent=text;};
let renderer=null,sampler=null,data=new Float32Array(0),videoMeta=null,last=performance.now(),frames=0;

// These are reconstruction budgets, not just rendering quality. Higher modes
// run more overlapping four-view DA3 inference windows and retain more points.
const qualities={
  low:{frames:8,pointStride:8,windowStep:1,label:'Fast preview'},
  medium:{frames:16,pointStride:6,windowStep:1,label:'Balanced'},
  high:{frames:24,pointStride:5,windowStep:1,label:'Detailed'},
  ultra:{frames:32,pointStride:4,windowStep:1,label:'Maximum detail'}
};
function setQuality(){const q=qualities[$('quality').value];const info=$('qualityInfo');if(info)info.textContent=`${q.frames} views · multi-view depth + camera poses · ${q.label}`;}
function makePLY(v){
  const n=v.length/8,k=.28209479177387814,L=['ply','format ascii 1.0',`element vertex ${n}`,'property float x','property float y','property float z','property float scale_0','property float scale_1','property float scale_2','property float rot_0','property float rot_1','property float rot_2','property float rot_3','property float f_dc_0','property float f_dc_1','property float f_dc_2','property float opacity','end_header'];
  for(let i=0;i<v.length;i+=8){const s=Math.max(.00025,v[i+3]),r=Math.max(.001,Math.min(.999,v[i+4])),g=Math.max(.001,Math.min(.999,v[i+5])),b=Math.max(.001,Math.min(.999,v[i+6])),a=Math.max(.01,Math.min(.99,v[i+7]));L.push(`${v[i]} ${v[i+1]} ${v[i+2]} ${Math.log(s)} ${Math.log(s)} ${Math.log(s)} 1 0 0 0 ${(r-.5)/k} ${(g-.5)/k} ${(b-.5)/k} ${Math.log(a/(1-a))}`);}return L.join('\\n');
}

sampler=new VideoSampler($('source'),$('frameCanvas'));
$('quality').addEventListener('change',setQuality);setQuality();

$('videoFile').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;$('create').disabled=true;videoMeta=null;$('source').classList.remove('ready');$('videoInfo').textContent=`Selected: ${file.name} · ${(file.size/1048576).toFixed(1)} MB`;$('videoNotice').textContent='▶ Loading your video now…';status('Loading uploaded video…');try{videoMeta=await sampler.load(file);$('source').classList.add('ready');$('videoInfo').textContent=`✓ ${file.name} · ${videoMeta.width}×${videoMeta.height} · ${videoMeta.duration.toFixed(2)}s`;$('videoNotice').textContent='✓ VIDEO LOADED — ready for real multi-view reconstruction.';status('Video loaded — choose reconstruction quality');$('create').disabled=false;}catch(err){console.error(err);$('videoInfo').textContent=`✗ ${file.name} could not be decoded`;$('videoNotice').textContent=`Video error: ${err.message}`;status('Video failed to load');}});

async function getRenderer(){if(renderer)return renderer;status('Loading Hugging Face gsplat.js…');const m=await import('./renderer.js?v=4');if(typeof m.SplatRenderer!=='function')throw new Error('The gsplat renderer module did not export SplatRenderer.');renderer=new m.SplatRenderer($('gl'));if(typeof renderer.setPLY!=='function')throw new Error('Loaded renderer.js is missing setPLY(). Please refresh the page once.');return renderer;}

$('create').onclick=async()=>{if(!videoMeta){status('Choose a video first');return;}try{$('create').disabled=true;const q=qualities[$('quality').value];status('Loading the real multi-view reconstruction model…');const {reconstructVideo}=await import('./reconstruct.js?v=1');status(`Extracting ${q.frames} video views…`);const images=await sampler.captureFrames(q.frames,(i,total)=>status(`Extracting video frame ${i}/${total}…`));data=await reconstructVideo(images,{pointStride:q.pointStride,windowStep:q.windowStep,splatSize:+$('size').value,onProgress:status});const r=await getRenderer();const count=data.length/8;let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;for(let i=0;i<data.length;i+=8){minX=Math.min(minX,data[i]);maxX=Math.max(maxX,data[i]);minY=Math.min(minY,data[i+1]);maxY=Math.max(maxY,data[i+1]);minZ=Math.min(minZ,data[i+2]);maxZ=Math.max(maxZ,data[i+2]);}status(`Uploading ${count.toLocaleString()} reconstructed Gaussians to gsplat.js…`);await r.setPLY(makePLY(data),count,{minX,minY,minZ,maxX,maxY,maxZ});$('count').textContent=count.toLocaleString();$('videoNotice').textContent='✓ REAL 3D RECONSTRUCTION COMPLETE — depth and camera motion were estimated from overlapping video views.';status(`Done — ${count.toLocaleString()} reconstructed Gaussian splats`);}catch(err){console.error(err);status('3D reconstruction failed');$('videoNotice').textContent=`Reconstruction error: ${err.message}`;}finally{$('create').disabled=!videoMeta;}};
$('clear').onclick=()=>{data=new Float32Array(0);renderer?.clear();$('count').textContent='0';status('Cleared');};
$('export').onclick=()=>{if(!data.length){status('Nothing to export');return;}const url=URL.createObjectURL(new Blob([makePLY(data)],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download='reconstructed-splats.ply';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
function loop(t){if(renderer)renderer.render();if(t-last>500){$('fps').textContent=Math.round(frames*1000/(t-last));frames=0;last=t;}frames++;requestAnimationFrame(loop);}status('Ready — choose a video');requestAnimationFrame(loop);
