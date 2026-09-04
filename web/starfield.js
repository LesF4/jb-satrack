// ---- starfield + faint orbit trace background ----
(function(){
  const canvas = document.getElementById('field');
  const ctx = canvas.getContext('2d');
  let w,h,stars=[],reduced=false;
  try{ reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}

  function resize(){
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  function initStars(){
    stars = [];
    const count = Math.floor((w*h)/9000);
    for(let i=0;i<count;i++){
      stars.push({
        x: Math.random()*w, y: Math.random()*h,
        r: Math.random()*1.3+0.2,
        tw: Math.random()*Math.PI*2,
        sp: 0.004+Math.random()*0.01
      });
    }
  }
  window.addEventListener('resize', ()=>{ resize(); initStars(); });
  resize(); initStars();

  let satT = 0;
  function draw(){
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = '#060a14';
    ctx.fillRect(0,0,w,h);

    for(const s of stars){
      s.tw += s.sp;
      const a = 0.35 + Math.sin(s.tw)*0.35 + 0.3;
      ctx.beginPath();
      ctx.fillStyle = 'rgba(220,235,245,'+Math.max(0.08,Math.min(0.9,a))+')';
      ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
      ctx.fill();
    }

    // faint arcing orbit path with a moving sat dot
    const cx = w*0.5, cy = h*0.42, rx = Math.min(w*0.62, 620), ry = Math.min(h*0.5, 320);
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(75,227,199,0.10)';
    ctx.lineWidth = 1;
    ctx.ellipse(cx, cy, rx, ry, 0.35, 0, Math.PI*2);
    ctx.stroke();

    if(!reduced) satT += 0.0016;
    const angle = satT * Math.PI*2;
    const px = cx + Math.cos(angle+0.35)*rx;
    const py = cy + Math.sin(angle+0.35)*ry;
    ctx.beginPath();
    ctx.fillStyle = 'rgba(75,227,199,0.9)';
    ctx.shadowColor = 'rgba(75,227,199,0.9)';
    ctx.shadowBlur = 8;
    ctx.arc(px, py, 2.4, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 0;

    requestAnimationFrame(draw);
  }
  draw();
})();
