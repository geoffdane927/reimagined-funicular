import * as ort from 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.2/dist/esm/ort.min.js';

const MODEL_URL='https://huggingface.co/Heliosoph/da3-base-4view-onnx/resolve/main/model_fp16.onnx';
const SIZE=504,MEAN=[.485,.456,.406],STD=[.229,.224,.225];
let sessionPromise=null,sourceCanvas=null,sourceCtx=null,modelCanvas=null,modelCtx=null;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mulMatVec=(R,x,y,z)=>[R[0]*x+R[1]*y+R[2]*z,R[3]*x+R[4]*y+R[5]*z,R[6]*x+R[7]*y+R[8]*z];
const transpose=R=>[R[0],R[3],R[6],R[1],R[4],R[7],R[2],R[5],R[8]];
function matMul(A,B){const C=new Array(9);for(let r=0;r<3;r++)for(let c=0;c<3;c++)C[r*3+c]=A[r*3]*B[c]+A[r*3+1]*B[c+3]+A[r*3+2]*B[c+6];return C;}
const matApply=(R,p)=>[R[0]*p[0]+R[1]*p[1]+R[2]*p[2],R[3]*p[0]+R[4]*p[1]+R[5]*p[2],R[6]*p[0]+R[7]*p[1]+R[8]*p[2]];
function cameraCenter(R,t){const q=mulMatVec(transpose(R),t[0],t[1],t[2]);return[-q[0],-q[1],-q[2]];}
const rotationFromExtrinsic=(e,o)=>[e[o],e[o+1],e[o+2],e[o+4],e[o+5],e[o+6],e[o+8],e[o+9],e[o+10]];
const translationFromExtrinsic=(e,o)=>[e[o+3],e[o+7],e[o+11]];

async function getSession(onProgress){
  if(sessionPromise)return sessionPromise;
  sessionPromise=(async()=>{
    ort.env.wasm.wasmPaths='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.2/dist/';
    const providers=[];if(globalThis.navigator?.gpu)providers.push('webgpu');providers.push('wasm');let lastError=null;
    for(const ep of providers)try{onProgress?.(`Loading Depth Anything 3 (${ep})…`);return await ort.InferenceSession.create(MODEL_URL,{executionProviders:[ep],graphOptimizationLevel:'all'});}catch(e){lastError=e;console.warn(`DA3 ${ep} failed`,e);}
    throw new Error(`Depth Anything 3 could not start: ${lastError?.message||lastError}`);
  })();
  try{return await sessionPromise;}catch(e){sessionPromise=null;throw e;}
}

function resizeForModel(image){
  if(!modelCanvas){modelCanvas=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(SIZE,SIZE):document.createElement('canvas');modelCanvas.width=SIZE;modelCanvas.height=SIZE;modelCtx=modelCanvas.getContext('2d',{willReadFrequently:true});}
  if(!sourceCanvas){sourceCanvas=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(image.width,image.height):document.createElement('canvas');sourceCanvas.width=image.width;sourceCanvas.height=image.height;sourceCtx=sourceCanvas.getContext('2d',{willReadFrequently:true});}
  if(sourceCanvas.width!==image.width||sourceCanvas.height!==image.height){sourceCanvas.width=image.width;sourceCanvas.height=image.height;}
  sourceCtx.putImageData(image,0,0);modelCtx.clearRect(0,0,SIZE,SIZE);modelCtx.drawImage(sourceCanvas,0,0,SIZE,SIZE);return modelCtx.getImageData(0,0,SIZE,SIZE);
}
function imageToTensor(image){const src=resizeForModel(image).data,x=new Float32Array(3*SIZE*SIZE);for(let y=0;y<SIZE;y++)for(let px=0;px<SIZE;px++){const i=(y*SIZE+px)*4,j=y*SIZE+px;x[j]=(src[i]/255-MEAN[0])/STD[0];x[SIZE*SIZE+j]=(src[i+1]/255-MEAN[1])/STD[1];x[2*SIZE*SIZE+j]=(src[i+2]/255-MEAN[2])/STD[2];}return x;}
function percentile(values,p){if(!values.length)return 0;const a=Array.from(values).sort((x,y)=>x-y);return a[Math.floor((a.length-1)*p)];}

// Convert the local world frame of a 4-view DA3 window into the already
// reconstructed global world frame. DA3's extrinsics are world->camera, so
// camera-to-world is R^T and the world-frame rotation is Wg * Rlocal.
function alignWindow(localCenters,globalCenters,localRotation,globalCameraToWorld){
  const A=matMul(globalCameraToWorld,localRotation),ratios=[];
  for(let i=0;i<localCenters.length;i++)for(let j=i+1;j<localCenters.length;j++){
    const dl=Math.hypot(localCenters[i][0]-localCenters[j][0],localCenters[i][1]-localCenters[j][1],localCenters[i][2]-localCenters[j][2]);
    const dg=Math.hypot(globalCenters[i][0]-globalCenters[j][0],globalCenters[i][1]-globalCenters[j][1],globalCenters[i][2]-globalCenters[j][2]);
    if(dl>1e-4&&dg>1e-4)ratios.push(dg/dl);
  }
  const s=ratios.length?percentile(ratios,.5):1,lc=localCenters[0],gc=globalCenters[0],q=matApply(A,lc);
  return{A,s,b:[gc[0]-s*q[0],gc[1]-s*q[1],gc[2]-s*q[2]]};
}
const transformPoint=(T,p)=>{const q=matApply(T.A,p);return[q[0]*T.s+T.b[0],q[1]*T.s+T.b[1],q[2]*T.s+T.b[2]];};

export async function reconstructVideo(frames,{pointStride=6,windowStep=1,splatSize=1,onProgress}={}){
  if(frames.length<4)throw new Error('At least 4 video frames are required for multi-view reconstruction.');
  const session=await getSession(onProgress),inputName=session.inputNames[0],out=[],globalCenters=new Map(),globalRotations=new Map(),starts=[];
  for(let s=0;s+3<frames.length;s+=windowStep)starts.push(s);if(starts[starts.length-1]!==frames.length-4)starts.push(frames.length-4);
  for(let wi=0;wi<starts.length;wi++){
    const start=starts[wi],imgs=frames.slice(start,start+4).map(imageToTensor),input=new Float32Array(4*3*SIZE*SIZE);
    for(let v=0;v<4;v++)input.set(imgs[v],v*3*SIZE*SIZE);
    onProgress?.(`Reconstructing views ${start+1}–${start+4} of ${frames.length}…`);
    const result=await session.run({[inputName]:new ort.Tensor('float32',input,[1,4,3,SIZE,SIZE])});
    const depth=result.depth.data,conf=result.depth_conf.data,ext=result.extrinsics.data,K=result.intrinsics.data,localCenters=[],localRots=[];
    for(let v=0;v<4;v++){const eo=v*12,R=rotationFromExtrinsic(ext,eo),t=translationFromExtrinsic(ext,eo);localRots.push(R);localCenters.push(cameraCenter(R,t));}
    let T={A:[1,0,0,0,1,0,0,0,1],s:1,b:[0,0,0]};
    if(wi>0){const common=[];for(let v=0;v<4;v++)if(globalCenters.has(start+v))common.push(v);if(common.length>=2){const lc=common.map(v=>localCenters[v]),gc=common.map(v=>globalCenters.get(start+v)),ref=common[0];T=alignWindow(lc,gc,localRots[ref],globalRotations.get(start+ref));}}
    const overlap=wi===0?0:Math.max(0,4-windowStep);
    for(let v=0;v<4;v++){
      const frameIndex=start+v,R=localRots[v],t=translationFromExtrinsic(ext,v*12);
      globalCenters.set(frameIndex,transformPoint(T,localCenters[v]));globalRotations.set(frameIndex,matMul(T.A,transpose(R)));
      if(wi>0&&v<overlap)continue;
      const kd=K.slice(v*9,v*9+9),fx=Math.max(1,kd[0]),fy=Math.max(1,kd[4]),cx=kd[2],cy=kd[5],dOff=v*SIZE*SIZE,cOff=v*SIZE*SIZE,sample=[];
      for(let y=0;y<SIZE;y+=Math.max(2,pointStride*2))for(let x=0;x<SIZE;x+=Math.max(2,pointStride*2)){const d=depth[dOff+y*SIZE+x],c=conf[cOff+y*SIZE+x];if(Number.isFinite(d)&&d>1e-4&&Number.isFinite(c))sample.push(c);}
      const c20=percentile(sample,.20),c95=percentile(sample,.95),frame=frames[frameIndex];
      for(let y=0;y<SIZE;y+=pointStride)for(let x=0;x<SIZE;x+=pointStride){
        const idx=y*SIZE+x,d=depth[dOff+idx],c=conf[cOff+idx];if(!Number.isFinite(d)||d<=1e-4||!Number.isFinite(c)||c<c20)continue;
        const cn=clamp((c-c20)/Math.max(1e-5,c95-c20),0,1),pc=[(x-cx)*d/fx,(y-cy)*d/fy,d],q=mulMatVec(transpose(R),pc[0]-t[0],pc[1]-t[1],pc[2]-t[2]),pw=transformPoint(T,q);
        const sx=clamp(Math.floor(x*frame.width/SIZE),0,frame.width-1),sy=clamp(Math.floor(y*frame.height/SIZE),0,frame.height-1),ci=(sy*frame.width+sx)*4;
        const scale=Math.max(.0004,d*Math.max(1,pointStride)/Math.max(1,(fx+fy)*.5)*.55*splatSize*T.s);
        out.push(pw[0],-pw[1],-pw[2],scale,frame.data[ci]/255,frame.data[ci+1]/255,frame.data[ci+2]/255,.16+.76*cn);
      }
    }
  }
  if(!out.length)throw new Error('Depth Anything 3 returned no valid 3D points.');
  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  for(let i=0;i<out.length;i+=8){minX=Math.min(minX,out[i]);maxX=Math.max(maxX,out[i]);minY=Math.min(minY,out[i+1]);maxY=Math.max(maxY,out[i+1]);minZ=Math.min(minZ,out[i+2]);maxZ=Math.max(maxZ,out[i+2]);}
  const centerX=(minX+maxX)/2,centerY=(minY+maxY)/2,centerZ=(minZ+maxZ)/2,sceneScale=6/Math.max(maxX-minX,maxY-minY,maxZ-minZ,1e-3);
  for(let i=0;i<out.length;i+=8){out[i]=(out[i]-centerX)*sceneScale;out[i+1]=(out[i+1]-centerY)*sceneScale;out[i+2]=(out[i+2]-centerZ)*sceneScale;out[i+3]*=sceneScale;}
  onProgress?.(`Reconstruction complete · ${(out.length/8).toLocaleString()} 3D Gaussians`);return new Float32Array(out);
}
