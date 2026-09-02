export class VideoSampler {
  constructor(video, canvas) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', {willReadFrequently:true});
    this.url = null;
  }

  async load(file) {
    if (!file || !file.type.startsWith('video/')) throw Error('Please choose a video file.');
    if (this.url) URL.revokeObjectURL(this.url);

    const v = this.video;
    this.url = URL.createObjectURL(file);
    v.pause();
    v.removeAttribute('src');
    v.load();
    v.src = this.url;
    v.preload = 'auto';

    await new Promise((resolve, reject) => {
      const ok = () => { cleanup(); resolve(); };
      const fail = () => { cleanup(); reject(Error('The browser could not decode this video. Try an MP4/H.264 video.')); };
      const cleanup = () => {
        v.removeEventListener('loadedmetadata', ok);
        v.removeEventListener('error', fail);
      };
      v.addEventListener('loadedmetadata', ok, {once:true});
      v.addEventListener('error', fail, {once:true});
      v.load();
    });

    if (!v.videoWidth || !v.videoHeight || !Number.isFinite(v.duration)) {
      throw Error('The video loaded, but its dimensions or duration could not be read.');
    }

    const w = Math.min(v.videoWidth, 640);
    const h = Math.max(1, Math.round(w * v.videoHeight / v.videoWidth));
    this.canvas.width = w;
    this.canvas.height = h;
    return {width:w, height:h, duration:v.duration};
  }

  async sample(count, stride, depthSpread, onProgress) {
    const out = [];
    const v = this.video;
    const duration = v.duration;
    if (!Number.isFinite(duration) || duration <= 0) throw Error('The video has no usable duration.');

    for (let f=0; f<count; f++) {
      const t = count === 1 ? 0 : f/(count-1) * Math.max(0, duration-0.05);
      await this.seek(t);
      this.ctx.drawImage(v, 0, 0, this.canvas.width, this.canvas.height);
      const {data,width,height} = this.ctx.getImageData(0,0,this.canvas.width,this.canvas.height);
      const z = (f/Math.max(1,count-1)-0.5) * depthSpread;
      for (let y=0; y<height; y+=stride) for (let x=0; x<width; x+=stride) {
        const i=(y*width+x)*4, a=data[i+3]/255;
        if (a<0.1) continue;
        const brightness=(data[i]+data[i+1]+data[i+2])/765;
        out.push((x/width-0.5)*4,(0.5-y/height)*3,z,0.018+brightness*0.035,
          data[i]/255,data[i+1]/255,data[i+2]/255,0.35+brightness*0.65);
      }
      onProgress?.(f+1,count);
    }
    return new Float32Array(out);
  }

  seek(t) {
    return new Promise((resolve, reject) => {
      const v=this.video;
      const target=Math.min(Math.max(0,t),Math.max(0,v.duration-0.05));
      if (Math.abs(v.currentTime-target)<0.01 && !v.seeking) { resolve(); return; }
      const done=()=>{cleanup(); resolve();};
      const fail=()=>{cleanup(); reject(Error('Could not seek to a video frame.'));};
      const cleanup=()=>{
        v.removeEventListener('seeked',done);
        v.removeEventListener('error',fail);
      };
      v.addEventListener('seeked',done,{once:true});
      v.addEventListener('error',fail,{once:true});
      v.currentTime=target;
    });
  }
}
