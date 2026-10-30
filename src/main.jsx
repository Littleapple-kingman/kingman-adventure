import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import './style.css';

const STAGES = [
  { name: 'ป่าเขียว', icon: '🌿', sky: ['#9ce9bd', '#e6ffd1'], far: '#5eaf83', near: '#267b63', ground: '#315f45', accent: '#ffe88c' },
  { name: 'ป่าคริสตัล', icon: '💎', sky: ['#b7b6ff', '#f8d7ff'], far: '#8b79c9', near: '#6752a8', ground: '#46346f', accent: '#83f4ff' },
  { name: 'ภูเขาไฟ', icon: '🌋', sky: ['#ffb28a', '#ffdf9d'], far: '#bd6258', near: '#743b50', ground: '#493044', accent: '#ffdf71' },
  { name: 'ดินแดนน้ำแข็ง', icon: '❄️', sky: ['#a6e8ff', '#e6fbff'], far: '#82c4dc', near: '#4986a8', ground: '#41677e', accent: '#ffffff' },
  { name: 'ปราสาท KINGMAN', icon: '🏰', sky: ['#b9a0ec', '#f8c5e8'], far: '#8870b9', near: '#59447f', ground: '#392b58', accent: '#ffe18d' },
];
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
const readNum = (key, fallback = 0) => { try { return Number(localStorage.getItem(key) || fallback); } catch { return fallback; } };

function App() {
  const [page, setPage] = useState('home');
  const [stage, setStage] = useState(1);
  const [mode, setMode] = useState('normal');
  const [playerName, setPlayerName] = useState(() => { try { return localStorage.getItem('kmName') || 'KINGMAN'; } catch { return 'KINGMAN'; } });
  const [best, setBest] = useState(() => readNum('kmBest'));
  const [totalGems, setTotalGems] = useState(() => readNum('kmGems'));
  const [unlocked, setUnlocked] = useState(() => Math.max(1, readNum('kmUnlock', 1)));
  const [scores, setScores] = useState([]);
  const [hud, setHud] = useState({ score: 0, shells: 0, combo: 0, hearts: 3, distance: 0, speed: 1 });
  const [result, setResult] = useState({ message: '', cleared: false });
  const [notice, setNotice] = useState('');
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const nameRef = useRef(playerName);

  useEffect(() => { nameRef.current = playerName; }, [playerName]);
  const loadScores = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('kingman_scores').select('*').order('score', { ascending: false }).limit(10);
    if (!error && data) setScores(data);
  }, []);
  useEffect(() => { loadScores(); }, [loadScores]);

  const startGame = useCallback(() => {
    setHud({ score: 0, shells: 0, combo: 0, hearts: mode === 'normal' ? 3 : 2, distance: 0, speed: mode === 'normal' ? 1 : 1.25 });
    setResult({ message: '', cleared: false });
    setNotice('');
    setPage('play');
  }, [mode]);

  const finishGame = useCallback(async (finalStats, cleared, message) => {
    setHud(finalStats);
    setResult({ message, cleared });
    setPage('result');
    setBest(old => {
      const next = Math.max(old, finalStats.score);
      try { localStorage.setItem('kmBest', String(next)); } catch {}
      return next;
    });
    if (cleared) setUnlocked(old => {
      const next = Math.max(old, Math.min(STAGES.length, stage + 1));
      try { localStorage.setItem('kmUnlock', String(next)); } catch {}
      return next;
    });
    if (supabase) {
      const { error } = await supabase.from('kingman_scores').insert({ player_name: nameRef.current || 'KINGMAN', score: Math.round(finalStats.score), stage, mode });
      if (error) setNotice('บันทึกคะแนนออนไลน์ไม่สำเร็จ แต่คะแนนในเครื่องยังอยู่');
      else loadScores();
    }
  }, [stage, mode, loadScores]);

  useEffect(() => {
    if (page !== 'play' || !canvasRef.current) return undefined;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let alive = true;
    let last = 0;
    let hudClock = 0;
    let spawnClock = 0;
    let pickupClock = 0;
    let objects = [];
    let particles = [];
    let distance = 0;
    let score = 0;
    let shells = 0;
    let combo = 0;
    let comboTimer = 0;
    let hearts = mode === 'normal' ? 3 : 2;
    let invulnerable = 0;
    let magnetTimer = 0;
    let elapsed = 0;
    let gemCount = 0;
    let completed = false;
    const challenge = mode === 'challenge';
    const targetDistance = challenge ? 2400 : 1800;
    const palette = STAGES[stage - 1];
    const player = { x: 0, y: 0, vy: 0, w: 58, h: 76, slide: 0, onGround: true, run: 0 };
    const image = new Image();
    let imageReady = false;
    image.onload = () => { imageReady = true; };
    image.onerror = () => { imageReady = false; };
    image.src = '/kingman.png';

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const emit = (x, y, color, count = 8) => {
      for (let i = 0; i < count; i++) particles.push({ x, y, vx: (Math.random() - .5) * 5, vy: (Math.random() - .8) * 5, life: 25 + Math.random() * 20, color, r: 2 + Math.random() * 4 });
    };
    const jump = (power = 'normal') => {
      if (!alive || player.slide > 0) return;
      // A second tap upgrades an active upward jump instead of delaying the first tap.
      if (power === 'high' && !player.onGround && player.vy < 0) {
        player.vy = Math.min(player.vy, -19.5);
        emit(player.x + 25, player.y + player.h, '#fff2b0', 5);
        return;
      }
      if (!player.onGround) return;
      player.vy = power === 'high' ? -19.5 : -15.5;
      player.onGround = false;
      emit(player.x + 25, player.y + player.h, '#fff2b0', 5);
    };
    const slide = () => {
      if (!alive || !player.onGround) return;
      player.slide = 34;
    };
    const holdSlide = () => {
      if (!alive || !player.onGround) return;
      player.slide = 9999;
    };
    const releaseSlide = () => { if (player.slide > 0) player.slide = Math.min(player.slide, 8); };
    engineRef.current = { jump, slide, holdSlide, releaseSlide };

    const drawFallbackKingman = (x, y, w, h, sliding) => {
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      if (sliding) ctx.rotate(-.08);
      // Original friendly mascot placeholder; replace with public/kingman.png for the real mascot.
      ctx.fillStyle = '#ffd16b'; ctx.beginPath(); ctx.ellipse(0, 4, w * .43, h * .43, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff0bd'; ctx.beginPath(); ctx.ellipse(0, 12, w * .29, h * .25, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8b4c9d'; ctx.beginPath(); ctx.arc(-w * .24, -h * .25, w * .17, 0, Math.PI * 2); ctx.arc(w * .24, -h * .25, w * .17, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-w * .14, -h * .04, 7, 0, Math.PI * 2); ctx.arc(w * .14, -h * .04, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#37244d'; ctx.beginPath(); ctx.arc(-w * .13, -h * .035, 3, 0, Math.PI * 2); ctx.arc(w * .15, -h * .035, 3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8b4c58'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, h * .12, 9, .15, Math.PI - .15); ctx.stroke();
      ctx.fillStyle = '#f28cb5'; ctx.beginPath(); ctx.arc(-w * .27, h * .12, 5, 0, Math.PI * 2); ctx.arc(w * .27, h * .12, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };

    const drawBackground = (w, h, speed) => {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, palette.sky[0]); grad.addColorStop(1, palette.sky[1]);
      ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
      // distant clouds
      const cloudShift = (distance * .12) % (w + 180);
      for (let i = 0; i < 5; i++) {
        const cx = ((i * 205 - cloudShift + w + 180) % (w + 180)) - 60;
        const cy = 45 + (i % 3) * 38;
        ctx.fillStyle = '#ffffff66'; ctx.beginPath(); ctx.arc(cx, cy, 19, 0, Math.PI * 2); ctx.arc(cx + 20, cy - 8, 25, 0, Math.PI * 2); ctx.arc(cx + 43, cy, 18, 0, Math.PI * 2); ctx.fill();
      }
      // layered hills / crystal silhouettes
      for (let layer = 0; layer < 2; layer++) {
        const parallax = distance * (layer ? .42 : .18);
        const unit = layer ? 145 : 230;
        const offset = parallax % unit;
        ctx.fillStyle = layer ? palette.near : palette.far;
        ctx.globalAlpha = layer ? .72 : .55;
        for (let x = -unit - offset; x < w + unit; x += unit) {
          const peak = h * (layer ? .67 : .57) - (x / unit % 2 === 0 ? 30 : 0);
          ctx.beginPath(); ctx.moveTo(x, h * .83); ctx.lineTo(x + unit * .48, peak); ctx.lineTo(x + unit, h * .83); ctx.closePath(); ctx.fill();
          if (layer) {
            ctx.fillStyle = '#ffffff20'; ctx.beginPath(); ctx.moveTo(x + unit * .48, peak); ctx.lineTo(x + unit * .64, peak + 34); ctx.lineTo(x + unit * .48, peak + 24); ctx.lineTo(x + unit * .34, peak + 34); ctx.closePath(); ctx.fill(); ctx.fillStyle = palette.near;
          }
        }
        ctx.globalAlpha = 1;
      }
      // ground
      const groundY = h - 58;
      ctx.fillStyle = palette.ground; ctx.fillRect(0, groundY, w, h - groundY);
      ctx.fillStyle = palette.accent; ctx.fillRect(0, groundY, w, 5);
      const dash = (distance * 1.5) % 58;
      ctx.fillStyle = '#ffffff25';
      for (let x = -dash; x < w; x += 58) ctx.fillRect(x, groundY + 25, 27, 4);
      return groundY;
    };

    const rectHit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    const spawnObstacle = (w, groundY, speed) => {
      const roll = Math.random();
      const x = w + 40;
      if (roll < .38) objects.push({ type: 'spike', x, y: groundY - 34, w: 36, h: 34, hit: false });
      else if (roll < .62) objects.push({ type: 'pit', x, y: groundY - 3, w: 82 + Math.random() * 34, h: 62, hit: false });
      else if (roll < .82) objects.push({ type: 'overhead', x, y: groundY - 91, w: 76, h: 28, hit: false });
      else objects.push({ type: 'crate', x, y: groundY - 47, w: 44, h: 46, hit: false });
    };
    const spawnPickup = (w, groundY) => {
      const typeRoll = Math.random();
      const type = typeRoll < .58 ? 'gem' : typeRoll < .86 ? 'shell' : typeRoll < .94 ? 'heart' : 'magnet';
      const y = groundY - (Math.random() < .45 ? 118 : 55);
      objects.push({ type, x: w + 30, y, w: 30, h: 30, hit: false, bob: Math.random() * 6 });
    };

    const handleHit = () => {
      if (invulnerable > 0) return;
      hearts -= 1; combo = 0; comboTimer = 0; invulnerable = 90;
      emit(player.x + 25, player.y + 25, '#ff8aa9', 14);
      if (hearts <= 0) {
        const finalStats = { score: Math.round(score), shells, combo, hearts: 0, distance: Math.floor(distance), speed: Number((1 + elapsed / 55).toFixed(1)) };
        alive = false; finishGame(finalStats, false, 'หัวใจหมดแล้ว! ลองอีกครั้งนะ');
      }
    };

    const draw = (time) => {
      if (!alive) return;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width; const h = rect.height;
      if (!w || !h) { raf = requestAnimationFrame(draw); return; }
      const dt = Math.min((time - (last || time)) / 16.667, 2.2);
      last = time; elapsed += dt / 60;
      const speed = (challenge ? 4.7 : 3.7) + Math.min(4.8, elapsed * (challenge ? .09 : .065));
      const groundY = drawBackground(w, h, speed);
      player.x = Math.max(30, w * .19);
      if (!player.y) player.y = groundY - player.h;
      player.run += dt * speed * .12;
      player.vy += .68 * dt;
      player.y += player.vy * dt;
      if (player.y >= groundY - player.h) { player.y = groundY - player.h; player.vy = 0; player.onGround = true; }
      if (player.slide > 0) player.slide -= dt;
      if (invulnerable > 0) invulnerable -= dt;
      if (magnetTimer > 0) magnetTimer -= dt;
      if (comboTimer > 0) comboTimer -= dt; else combo = 0;
      distance += speed * dt * .11;
      score += speed * dt * .035;

      spawnClock += dt; pickupClock += dt;
      const obstacleEvery = Math.max(68, (challenge ? 104 : 132) - elapsed * .18);
      if (spawnClock > obstacleEvery) { spawnClock = 0; spawnObstacle(w, groundY, speed); }
      if (pickupClock > 72) { pickupClock = 0; spawnPickup(w, groundY); }

      const sliding = player.slide > 0;
      const pw = sliding ? 64 : 48; const ph = sliding ? 30 : 60;
      // Slightly forgiving hitbox: the visible mascot can brush an obstacle without losing a heart.
      const pbox = { x: player.x + 12, y: player.y + player.h - ph, w: pw - 20, h: ph - 5 };
      objects = objects.filter(o => {
        o.x -= speed * dt;
        if (o.type === 'pit') {
          const overPit = pbox.x + pbox.w * .65 > o.x + 7 && pbox.x + pbox.w * .35 < o.x + o.w - 7;
          if (overPit && pbox.y + pbox.h >= groundY - 3 && player.onGround) { o.hit = true; handleHit(); }
          ctx.fillStyle = '#1b1730'; ctx.fillRect(o.x, groundY, o.w, 60);
          ctx.fillStyle = '#ffffff25'; ctx.fillRect(o.x, groundY, o.w, 4);
        } else if (['spike', 'overhead', 'crate'].includes(o.type)) {
          if (o.type === 'spike') {
            ctx.fillStyle = '#f7f2ff'; ctx.beginPath(); ctx.moveTo(o.x, groundY); ctx.lineTo(o.x + o.w / 2, groundY - o.h); ctx.lineTo(o.x + o.w, groundY); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#b9a2d9'; ctx.fillRect(o.x, groundY - 5, o.w, 5);
          } else if (o.type === 'overhead') {
            ctx.fillStyle = '#8d4d91'; ctx.fillRect(o.x, o.y, o.w, o.h); ctx.fillStyle = '#ffc2e0'; ctx.fillRect(o.x + 8, o.y + 7, o.w - 16, 5);
          } else {
            ctx.fillStyle = '#a66a4f'; ctx.fillRect(o.x, o.y, o.w, o.h); ctx.strokeStyle = '#f5c28b'; ctx.lineWidth = 3; ctx.strokeRect(o.x + 4, o.y + 4, o.w - 8, o.h - 8);
          }
          const obox = { x: o.x + 4, y: o.type === 'spike' ? groundY - o.h + 8 : o.y + 3, w: o.w - 8, h: o.type === 'spike' ? o.h - 8 : o.h - 6 };
          if (!o.hit && rectHit(pbox, obox)) { o.hit = true; handleHit(); }
        } else {
          const bobY = o.y + Math.sin((elapsed * 5) + o.bob) * 5;
          if (magnetTimer > 0 && ['gem', 'shell'].includes(o.type)) {
            const dx = (player.x + 25) - o.x; const dy = (player.y + 30) - bobY;
            if (Math.hypot(dx, dy) < 190) { o.x += dx * .11; o.y += dy * .11; }
          }
          const symbols = { gem: '💎', heart: '❤️', magnet: '🧲' };
          if (o.type === 'shell') {
            // Turtle shell collectible: domed carapace with segmented scutes and a thick rim.
            const sx = o.x + 15, sy = bobY + 16;
            ctx.save(); ctx.translate(sx, sy);
            // lower rim / plastron
            ctx.fillStyle = '#e8bd78'; ctx.strokeStyle = '#69452f'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(-15, 3); ctx.quadraticCurveTo(-13, 13, 0, 14); ctx.quadraticCurveTo(13, 13, 15, 3); ctx.lineTo(12, 7); ctx.quadraticCurveTo(0, 12, -12, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
            // domed green-brown carapace
            const shellGrad = ctx.createLinearGradient(0, -15, 0, 8);
            shellGrad.addColorStop(0, '#9bd66b'); shellGrad.addColorStop(.48, '#568d43'); shellGrad.addColorStop(1, '#315f39');
            ctx.fillStyle = shellGrad; ctx.strokeStyle = '#294d32'; ctx.lineWidth = 2.2;
            ctx.beginPath(); ctx.moveTo(-15, 5); ctx.quadraticCurveTo(-17, -11, 0, -15); ctx.quadraticCurveTo(17, -11, 15, 5); ctx.quadraticCurveTo(0, 11, -15, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
            // central and side scutes make it unmistakably a turtle shell
            ctx.strokeStyle = '#c5df83'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(0, 7); ctx.moveTo(-10, -7); ctx.lineTo(-4, -2); ctx.lineTo(-7, 5); ctx.moveTo(10, -7); ctx.lineTo(4, -2); ctx.lineTo(7, 5); ctx.moveTo(-4, -2); ctx.lineTo(4, -2); ctx.stroke();
            ctx.fillStyle = 'rgba(232,245,171,.55)'; ctx.beginPath(); ctx.ellipse(-5, -9, 3, 1.5, -.35, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
          } else { ctx.font = '27px system-ui'; ctx.textAlign = 'center'; ctx.fillText(symbols[o.type], o.x + 15, bobY + 25); }
          if (!o.hit && rectHit(pbox, { x: o.x + 2, y: bobY + 2, w: 26, h: 26 })) {
            o.hit = true; combo += 1; comboTimer = 150;
            const bonus = Math.min(combo, 20) * 3;
            if (o.type === 'gem') { score += 50 + bonus; gemCount += 1; setTotalGems(v => { const n = v + 1; try { localStorage.setItem('kmGems', String(n)); } catch {} return n; }); }
            if (o.type === 'shell') { score += 25 + bonus; shells += 1; }
            if (o.type === 'heart') { score += 15; hearts = Math.min(challenge ? 4 : 5, hearts + 1); }
            if (o.type === 'magnet') { score += 10; magnetTimer = 420; }
            emit(o.x + 15, bobY + 15, o.type === 'gem' ? '#8ff8ff' : '#ffe49a', 9);
          }
        }
        return o.x + o.w > -20 && !o.hit;
      });

      // KINGMAN character with a real uploaded PNG when available.
      if (!(invulnerable > 0 && Math.floor(invulnerable / 5) % 2 === 0)) {
        if (imageReady) {
          if (sliding) ctx.drawImage(image, player.x - 3, player.y + player.h - 48, 76, 48);
          else ctx.drawImage(image, player.x, player.y, 62, 76);
        } else {
          if (sliding) drawFallbackKingman(player.x - 3, player.y + player.h - 46, 72, 45, true);
          else drawFallbackKingman(player.x, player.y, 58, 76, false);
        }
      }
      particles = particles.filter(p => p.life > 0);
      particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += .12 * dt; p.life -= dt; ctx.globalAlpha = Math.max(0, p.life / 35); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }); ctx.globalAlpha = 1;

      hudClock += dt;
      if (hudClock > 7) {
        hudClock = 0;
        setHud({ score: Math.round(score), shells, combo, hearts, distance: Math.floor(distance), speed: Number((speed / 4.2).toFixed(1)) });
      }
      if (distance >= targetDistance && !completed) {
        completed = true; alive = false;
        const finalStats = { score: Math.round(score + 500), shells, combo, hearts, distance: Math.floor(distance), speed: Number((speed / 4.2).toFixed(1)) };
        finishGame(finalStats, true, 'พิชิตด่านสำเร็จ! 🎉'); return;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    const onKey = e => {
      if (['Space', 'ArrowUp', 'KeyW', 'ArrowDown', 'KeyS'].includes(e.code)) e.preventDefault();
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') jump();
      if (e.code === 'ArrowDown' || e.code === 'KeyS') slide();
    };
    let pointerStart = null;
    let lastTapAt = 0;
    const onPointerDown = e => {
      e.preventDefault();
      pointerStart = { x: e.clientX, y: e.clientY };
      const now = performance.now();
      // Jump immediately on touch-down; a quick second tap boosts the jump already in progress.
      jump(now - lastTapAt < 280 ? 'high' : 'normal');
      lastTapAt = now;
    };
    const onPointerUp = e => {
      if (!pointerStart) return;
      const dx = e.clientX - pointerStart.x; const dy = e.clientY - pointerStart.y;
      // Swipe down remains a shortcut for sliding. Sliding can also be held with the button below.
      if (Math.abs(dx) > 22 || Math.abs(dy) > 22) {
        if (Math.abs(dy) > Math.abs(dx) && dy > 0) slide();
      }
      pointerStart = null;
    };
    window.addEventListener('keydown', onKey);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    return () => {
      alive = false; cancelAnimationFrame(raf); observer.disconnect();
      window.removeEventListener('keydown', onKey);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      engineRef.current = null;
    };
  }, [page, stage, mode, finishGame]);

  const changeName = () => {
    const value = window.prompt('ตั้งชื่อผู้เล่น', playerName);
    if (value && value.trim()) { setPlayerName(value.trim().slice(0, 18)); try { localStorage.setItem('kmName', value.trim().slice(0, 18)); } catch {} }
  };
  const stageData = STAGES[stage - 1];

  return <main className="app-shell"><div className="app-wrap">
    <header className="topbar"><button className="brand" onClick={() => setPage('home')}><span className="brand-crown">♛</span><span>KINGMAN <b>ADVENTURE</b></span></button><div className="wallet"><span className="wallet-pill">💎 {totalGems}</span><span className="wallet-pill">🏆 {best.toLocaleString()}</span></div></header>
    {page === 'home' && <>
      <section className="hero-card"><div className="hero-sparkle">✦　✧　✦</div><div className="hero-mascot">👑</div><p className="eyebrow">A LITTLE HERO, A BIG ADVENTURE</p><h1>KINGMAN <span>ADVENTURE</span></h1><p className="hero-copy">ออกวิ่งไปด้วยกัน กระโดดให้สุด สไลด์ให้ไว<br/>แล้วเก็บสมบัติให้เต็มกระเป๋า!</p><div className="hero-actions"><button className="primary-btn" onClick={() => setPage('stages')}>เริ่มผจญภัย <span>➜</span></button><button className="soft-btn" onClick={() => setPage('rank')}>🏆 ตารางคะแนน</button></div></section>
      <section className="feature-grid"><article className="feature-card"><span>↗</span><b>กระโดด & สไลด์</b><small>หลบอุปสรรคในเส้นทาง</small></article><article className="feature-card"><span>💎</span><b>เก็บสมบัติ</b><small>สะสมเพชรและกระดองเต่า</small></article><article className="feature-card"><span>⚡</span><b>COMBO</b><small>เก็บต่อเนื่องรับโบนัส</small></article></section>
      <section className="how-card"><div><p className="eyebrow">HOW TO PLAY</p><h2>วิธีควบคุม</h2></div><div className="how-controls"><span><kbd>SPACE</kbd> / <kbd>↑</kbd> กระโดด</span><span><kbd>↓</kbd> สไลด์</span><span>📱 แตะ 1 ครั้งกระโดด · แตะ 2 ครั้งกระโดดสูง · กดค้างสไลด์</span></div></section>
      {!supabase && <p className="status-note">โหมดเล่นในเครื่องพร้อมใช้งาน · ตารางคะแนนออนไลน์จะเปิดเมื่อเชื่อม Supabase</p>}
    </>}
    {page === 'stages' && <section className="page-section"><div className="section-heading"><div><p className="eyebrow">CHOOSE YOUR WORLD</p><h1>เลือกด่านผจญภัย</h1></div><button className="back-btn" onClick={() => setPage('home')}>← กลับ</button></div><div className="mode-switch"><button className={mode === 'normal' ? 'selected' : ''} onClick={() => setMode('normal')}>🌼 โหมดปกติ <small>หัวใจ 3 ดวง</small></button><button className={mode === 'challenge' ? 'selected challenge' : ''} onClick={() => setMode('challenge')}>🔥 โหมดท้าทาย <small>เร็วขึ้น · หัวใจ 2 ดวง</small></button></div><div className="stage-grid">{STAGES.map((s, i) => <article className={`stage-card stage-${i + 1}`} key={s.name}><div className="stage-art">{s.icon}</div><div className="stage-meta"><span>WORLD {String(i + 1).padStart(2, '0')}</span>{i + 1 <= unlocked ? <b>UNLOCKED</b> : <b className="locked">🔒 LOCKED</b>}</div><h3>{s.name}</h3><p>{i === 0 ? 'เริ่มต้นการเดินทางในป่ามหัศจรรย์' : i === 1 ? 'ระวังผลึกคริสตัลที่แวววาว' : i === 2 ? 'ฝ่าความร้อนแรงของภูเขาไฟ' : i === 3 ? 'วิ่งผ่านดินแดนหิมะเย็นฉ่ำ' : 'ผจญภัยสู่ปราสาทแห่ง KINGMAN'}</p><button disabled={i + 1 > unlocked} onClick={() => { setStage(i + 1); startGame(); }}>{i + 1 <= unlocked ? 'เข้าเล่นด่าน →' : 'ผ่านด่านก่อนหน้าเพื่อปลดล็อก'}</button></article>)}</div></section>}
    {page === 'play' && <section className="play-section"><div className="play-heading"><div><p className="eyebrow">{mode === 'normal' ? '🌼 NORMAL MODE' : '🔥 CHALLENGE MODE'}</p><h2>{stageData.icon} {stageData.name}</h2></div><button className="exit-btn" onClick={() => { setPage('result'); setResult({ message: 'ออกจากการผจญภัย', cleared: false }); }}>ออกจากเกม</button></div><div className="game-frame"><div className="game-hud"><span>❤️ {hud.hearts}</span><span>🐢 {hud.shells}</span><span>⭐ {hud.score.toLocaleString()}</span><span>⚡ x{hud.combo}</span><span>📏 {hud.distance} m</span></div><canvas ref={canvasRef} className="game-canvas" aria-label="KINGMAN วิ่งผจญภัย"></canvas><div className="game-hint">แตะหน้าจอ = กระโดดทันที · แตะซ้ำ = กระโดดสูง · ปัดลง/กดปุ่มค้าง = สไลด์</div></div><div className="touch-controls"><button onPointerDown={e => { e.preventDefault(); engineRef.current?.jump('normal'); }} onContextMenu={e => e.preventDefault()}>⬆️ <b>กระโดด</b></button><button onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); engineRef.current?.holdSlide(); }} onPointerUp={() => engineRef.current?.releaseSlide()} onPointerCancel={() => engineRef.current?.releaseSlide()} onContextMenu={e => e.preventDefault()}>⬇️ <b>กดค้างสไลด์</b></button></div></section>}
    {page === 'result' && <section className="result-card"><div className="result-icon">{result.cleared ? '🏆' : '💫'}</div><p className="eyebrow">ADVENTURE REPORT</p><h1>{result.message || 'จบการผจญภัย'}</h1><div className="result-score"><small>คะแนนรวม</small><strong>{hud.score.toLocaleString()}</strong></div><div className="result-stats"><div><b>{hud.distance}</b><small>ระยะทาง (m)</small></div><div><b>{hud.shells}</b><small>กระดอง</small></div><div><b>{hud.combo}</b><small>COMBO</small></div><div><b>{hud.hearts}</b><small>หัวใจเหลือ</small></div></div>{notice && <p className="status-note">{notice}</p>}<div className="result-actions"><button className="primary-btn" onClick={startGame}>เล่นอีกครั้ง ↻</button><button className="soft-btn" onClick={() => setPage('stages')}>เลือกด่าน</button><button className="text-btn" onClick={() => setPage('home')}>กลับหน้าแรก</button></div></section>}
    {page === 'rank' && <section className="page-section"><div className="section-heading"><div><p className="eyebrow">HALL OF FAME</p><h1>🏆 ตารางคะแนน</h1></div><button className="back-btn" onClick={() => setPage('home')}>← กลับ</button></div><div className="rank-panel"><div className="rank-head"><span>อันดับ / ผู้เล่น</span><span>คะแนน</span></div>{scores.length ? scores.map((item, i) => <div className="rank-row" key={item.id}><span><b className={`rank-number rank-${i + 1}`}>{i + 1}</b><span>{item.player_name}<small>ด่าน {item.stage} · {item.mode === 'challenge' ? 'ท้าทาย' : 'ปกติ'}</small></span></span><strong>{Number(item.score).toLocaleString()}</strong></div>) : <div className="empty-rank">{supabase ? 'ยังไม่มีคะแนน ลองลงสนามเป็นคนแรกเลย!' : 'ยังไม่ได้เชื่อมต่อ Supabase'}</div>}</div><div className="rank-actions"><button className="soft-btn" onClick={loadScores}>↻ รีเฟรชคะแนน</button><button className="soft-btn" onClick={changeName}>👤 เปลี่ยนชื่อผู้เล่น ({playerName})</button></div></section>}
    <footer className="footer">Made with ♡ for KINGMAN · KINGMAN ADVENTURE</footer>
  </div></main>;
}

createRoot(document.getElementById('root')).render(<App />);
