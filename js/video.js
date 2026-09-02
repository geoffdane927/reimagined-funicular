export class VideoSampler {
  constructor(video, canvas) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', {willReadFrequently:true});
    this.url = null;
    this.file = null;
  }

  async load(file) {
    if (!file) throw Error('No video file was selected.');
    const looksLikeVideo = file.type.startsWith('video/') || /\.(mp4|m4v|webm|mov|ogv)$/i.test(file.name);
    if (!looksLikeVideo) throw Error('Please choose a video file.');
    if (this.url) URL.revokeObjectURL(this.url);
    this.file = file;
    const v = this.video;
    this.url = URL.createObjectURL(file);
    v.pause();
    v.removeAttribute('src');
    v.load();
    v.src = this.url;
    v.preload = 'metadata';
    v.muted = true;
    v.playsInline = true;

    await new Promise((resolve,reject) => {
      let settled = false;
      const cleanup = () => {
        v.removeEventListener('loadedmetadata', ok);
        v.removeEventListener('canplay', ok);
        v.removeEventListener('error', fail);
      };
      const ok = () => { if (!settled) { settled=true; cleanup(); resolve(); } };
      const fail = () => { if (!settled) { settled=true; cleanup(); reject(Error('Firefox could not decode this video. Try an H.264 MP4 or WebM video.')); } };
      v.addEventListener('loadedmetadata', ok);
      v.addEventListener('canplay', ok);
      v.addEventListener('error', fail);
      v.load();
    });

    if (!v.videoWidth || !v.videoHeight || !Number.isFinite(v.duration) || v.duration <= 0)
      throw Error('The video loaded, but its dimensions or duration could not be read.');

    const w = Math.min(v.videoWidth, 640);
    const h = Math.max(1, Math.round(w * v.videoHeight / v.videoWidth));
    this.canvas.width = w;
    this.canvas.height = h;
    v.currentTime = 0;
    return {width:v.videoWidth,height:v.videoHeight,duration:v.duration,displayWidth:w,displayHeight:h,name:file.name,size:file.size,type:file.type};
  }

  async sample(count, stride, depthSpread, onProgress) {
    const out=[];
    const v=this.video;
    const duration=v.duration;
    if (!Number.isFinite(duration) || duration<=0) throw Error('The video has no usable duration.');
    for (let f=0; f<count; f++) {
      const t=count===1?0:(f/(count-1))*Math.max(0,duration-0.03);
      await this.seek(t);
      this.ctx.drawImage(v,0,0,this.canvas.width,this.canvas.height);
      const {data,width,height}=this.ctx.getImageData(0,0,this.canvas.width,this.canvas.height);
      const z=(f/Math.max(1,count-1)-0.5)*depthSpread;
      for(let y=0;y<height;y+=stride) for(let x=0;x<width;x+=stride){
        const i=(y*width+x)*4;
        if(data[i+3]<25) continue;
        const brightness=(data[i]+data[i+1]+data[i+2])/765;
        out.push((x/width-.5)*4,(.5-y/height)*3,z,.018+brightness*.035,data[i]/255,data[i+1]/255,data[i+2]/255,.35+brightness*.65);
      }
      onProgress?.(f+1,count);
      await new Promise(r=>setTimeout(r,0));
    }
    return new Float32Array(out);
  }

  seek(t) {
    return new Promise((resolve,reject)=>{
      const v=this.video;
      const target=Math.min(Math.max(0,t),Math.max(0,v.duration-0.03));
      if(Math.abs(v.currentTime-target)<0.01 && !v.seeking){resolve();return;}
      let timer;
      const cleanup=()=>{clearTimeout(timer);v.removeEventListener('seeked',done);v.removeEventListener('error',fail);};
      const done=()=>{cleanup();resolve();};
      const fail=()=>{cleanup();reject(Error('The browser failed while seeking the video.'));};
      v.addEventListener('seeked',done,{once:true});
      v.addEventListener('error',fail,{once:true});
      timer=setTimeout(()=>{cleanup();reject(Error('Video seeking timed out.'));},5000);
      try{v.currentTime=target;}catch(e){fail();}
    });
  }
}
