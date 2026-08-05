// Get Preact and HTM from global window object
const { h, render } = preact;
const { useState, useEffect, useRef, useCallback } = preactHooks;

// Bind HTM to Preact's h function
const html = htm.bind(h);

// 动态注入 OptionWheel 极简宋体黑字 CSS 样式
const injectOptionWheelCSS = () => {
    if (document.getElementById('option-wheel-css')) return;
    const style = document.createElement('style');
    style.id = 'option-wheel-css';
    style.textContent = `
        .option-wheel {
          --ow-text-color: #666666;
          --ow-active-color: #000000;
          --ow-font-size: 1.15rem;
          --ow-inset: 10px;

          position: relative;
          width: 100%;
          height: 100%;
          overflow: hidden;
          cursor: grab;
          user-select: none;
          touch-action: none;
          outline: none;
        }

        .option-wheel--dragging {
          cursor: grabbing;
        }

        .option-wheel__item {
          position: absolute;
          top: 50%;
          left: var(--ow-inset);
          white-space: nowrap;
          font-family: 'SimSun', 'Songti SC', 'STSong', 'STZhongsong', serif;
          font-size: var(--ow-font-size);
          line-height: 1.2;
          font-weight: 400;
          transform-origin: left center;
          cursor: pointer;
          will-change: transform, opacity, filter;
          color: color-mix(in srgb, var(--ow-active-color) calc(var(--ow-p, 0) * 100%), var(--ow-text-color));
          transition: font-weight 0.2s ease;
        }

        .option-wheel--right .option-wheel__item {
          left: auto;
          right: var(--ow-inset);
          transform-origin: right center;
        }

        .option-wheel__item--selected {
          font-weight: 700;
          color: #000000 !important;
          text-shadow: none !important;
        }
    `;
    document.head.appendChild(style);
};
injectOptionWheelCSS();

// OptionWheel 3D 滚轮组件 (支持二级标题导览)
const OptionWheel = ({
  items = [],
  defaultSelected = 0,
  onChange,
  textColor = '#666666',
  activeColor = '#000000',
  side = 'left',
  fontSize = 1.15,
  spacing = 1.5,
  curve = 0.85,
  tilt = 8,
  blur = 1.5,
  fade = 0.35,
  minOpacity = 0.1,
  smoothing = 200,
  inset = 10,
  loop = false,
  draggable = true,
  soundUrl = '',
  soundVolume = 0.5,
  className = ''
}) => {
  const rootRef = useRef(null);
  const itemRefs = useRef([]);
  const posRef = useRef(defaultSelected);
  const targetRef = useRef(defaultSelected);
  const rafRef = useRef(null);
  const lastRef = useRef(0);
  const cfgRef = useRef({});
  const onChangeRef = useRef(onChange);
  const selectedRef = useRef(defaultSelected);
  const wheelTimerRef = useRef(null);
  const dragRef = useRef(null);
  const dragMovedRef = useRef(false);
  const audioRef = useRef(null);
  const audioUrlRef = useRef('');
  const lastTickRef = useRef(0);
  const [selectedIndex, setSelectedIndex] = useState(defaultSelected);
  const [isDragging, setIsDragging] = useState(false);

  const remPx = typeof window !== 'undefined' ? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16 : 16;

  onChangeRef.current = onChange;
  cfgRef.current = {
    count: items.length,
    items,
    rowH: Math.max(fontSize * spacing * remPx, 1),
    curve,
    tilt,
    blur,
    fade,
    minOpacity,
    side,
    loop,
    smoothing,
    draggable,
    soundUrl,
    soundVolume
  };

  const runFrame = useCallback(now => {
    const dt = Math.min((now - lastRef.current) / 1000, 0.05);
    lastRef.current = now;
    const cfg = cfgRef.current;
    const tau = Math.max(cfg.smoothing, 1) / 1000;
    const k = 1 - Math.exp(-dt / tau);

    const target = targetRef.current;
    const cur = posRef.current;
    let next = cur + (target - cur) * k;
    const settled = Math.abs(target - next) < 0.001;
    if (settled) next = target;
    posRef.current = next;

    const els = itemRefs.current;
    const n = cfg.count;
    const mirror = cfg.side === 'right' ? -1 : 1;
    const tiltRad = (cfg.tilt * Math.PI) / 180;
    const R = tiltRad > 0.0005 ? cfg.rowH / tiltRad : 0;
    for (let i = 0; i < n; i++) {
      const el = els[i];
      if (!el) continue;
      let d = i - next;
      if (cfg.loop && n > 1) {
        d = ((d % n) + n) % n;
        if (d > n / 2) d -= n;
      }
      const dist = Math.abs(d);
      let x = 0;
      let y = d * cfg.rowH;
      let rot = 0;
      if (R > 0) {
        const ang = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, d * tiltRad));
        y = R * Math.sin(ang);
        x = -mirror * R * (1 - Math.cos(ang)) * cfg.curve;
        rot = (mirror * ang * 180) / Math.PI;
      }
      el.style.transform = `translate(${x.toFixed(2)}px, calc(${y.toFixed(2)}px - 50%)) rotate(${rot.toFixed(3)}deg)`;
      el.style.opacity = String(Math.max(cfg.minOpacity, 1 - dist * cfg.fade));
      el.style.filter = cfg.blur > 0 ? `blur(${(dist * cfg.blur).toFixed(2)}px)` : 'none';
      el.style.setProperty('--ow-p', Math.max(0, 1 - Math.min(dist, 1)).toFixed(4));
    }

    rafRef.current = settled ? null : requestAnimationFrame(runFrame);
  }, []);

  const startLoop = useCallback(() => {
    if (rafRef.current != null) return;
    lastRef.current = performance.now();
    rafRef.current = requestAnimationFrame(runFrame);
  }, [runFrame]);

  const playTick = useCallback(() => {
    const { soundUrl, soundVolume } = cfgRef.current;
    if (!soundUrl) return;
    const now = performance.now();
    if (now - lastTickRef.current < 70) return;
    lastTickRef.current = now;
    if (!audioRef.current || audioUrlRef.current !== soundUrl) {
      audioRef.current = new Audio(soundUrl);
      audioRef.current.preload = 'auto';
      audioUrlRef.current = soundUrl;
    }
    const audio = audioRef.current;
    audio.volume = Math.min(Math.max(soundVolume, 0), 1);
    audio.currentTime = 0;
    audio.play()?.catch(() => {});
  }, []);

  const applyTarget = useCallback(
    (value, snap) => {
      const cfg = cfgRef.current;
      let v = value;
      if (!cfg.loop) v = Math.min(Math.max(v, 0), Math.max(cfg.count - 1, 0));
      if (snap) v = Math.round(v);
      targetRef.current = v;
      const idx = ((Math.round(v) % cfg.count) + cfg.count) % cfg.count;
      if (idx !== selectedRef.current) {
        selectedRef.current = idx;
        setSelectedIndex(idx);
        onChangeRef.current?.(idx, cfg.items[idx]);
        playTick();
      }
      startLoop();
    },
    [startLoop, playTick]
  );

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = e => {
      e.preventDefault();
      const cfg = cfgRef.current;
      const delta = e.deltaMode === 1 ? e.deltaY * 24 : e.deltaY;
      const step = Math.max(-1, Math.min(1, delta / cfg.rowH));
      applyTarget(targetRef.current + step, false);
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = setTimeout(() => applyTarget(targetRef.current, true), 140);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
    };
  }, [applyTarget]);

  const handlePointerDown = useCallback(e => {
    if (!cfgRef.current.draggable) return;
    dragRef.current = { y: e.clientY, start: targetRef.current, id: e.pointerId };
    dragMovedRef.current = false;
    setIsDragging(true);
  }, []);

  const handlePointerMove = useCallback(
    e => {
      const drag = dragRef.current;
      if (!drag) return;
      const dy = e.clientY - drag.y;
      if (!dragMovedRef.current && Math.abs(dy) > 4) {
        dragMovedRef.current = true;
        rootRef.current?.setPointerCapture(drag.id);
      }
      if (dragMovedRef.current) applyTarget(drag.start - dy / cfgRef.current.rowH, false);
    },
    [applyTarget]
  );

  const handlePointerEnd = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setIsDragging(false);
    if (dragMovedRef.current) applyTarget(targetRef.current, true);
  }, [applyTarget]);

  const handleItemClick = useCallback(
    index => {
      if (dragMovedRef.current) return;
      const cfg = cfgRef.current;
      const cur = targetRef.current;
      let d = index - (((cur % cfg.count) + cfg.count) % cfg.count);
      if (cfg.loop && cfg.count > 1) {
        if (d > cfg.count / 2) d -= cfg.count;
        else if (d < -cfg.count / 2) d += cfg.count;
      }
      applyTarget(cur + d, true);
    },
    [applyTarget]
  );

  const handleKeyDown = useCallback(
    e => {
      let delta = null;
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') delta = -1;
      else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') delta = 1;
      if (delta == null) return;
      e.preventDefault();
      applyTarget(Math.round(targetRef.current) + delta, true);
    },
    [applyTarget]
  );

  useEffect(() => {
    applyTarget(targetRef.current, false);
  }, [items, fontSize, spacing, curve, tilt, blur, fade, minOpacity, side, loop, smoothing, applyTarget]);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      audioRef.current?.pause();
    },
    []
  );

  return html`
    <div
      ref=${rootRef}
      role="listbox"
      tabIndex=${0}
      aria-label="Option wheel"
      className=${`option-wheel${side === 'right' ? ' option-wheel--right' : ''}${isDragging ? ' option-wheel--dragging' : ''}${className ? ` ${className}` : ''}`}
      style=${{
        '--ow-text-color': textColor,
        '--ow-active-color': activeColor,
        '--ow-font-size': `${fontSize}rem`,
        '--ow-inset': `${inset}px`
      }}
      onPointerDown=${handlePointerDown}
      onPointerMove=${handlePointerMove}
      onPointerUp=${handlePointerEnd}
      onPointerCancel=${handlePointerEnd}
      onKeyDown=${handleKeyDown}
    >
      ${items.map((label, index) => html`
        <div
          key=${`${label}-${index}`}
          ref=${el => { itemRefs.current[index] = el; }}
          role="option"
          aria-selected=${selectedIndex === index}
          className=${`option-wheel__item${selectedIndex === index ? ' option-wheel__item--selected' : ''}`}
          onClick=${() => handleItemClick(index)}
        >
          ${label}
        </div>
      `)}
    </div>
  `;
};

// 支持【多图 / 多视频】上传与预览的智能媒体组件
function MediaUploadBox({ type = 'media', label = '素材上传位置' }) {
    const [mediaList, setMediaList] = useState([]);

    useEffect(() => {
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }, [mediaList]);

    const handleFileChange = (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            const newItems = files.map(file => ({
                id: Math.random().toString(36).substring(2, 9),
                url: URL.createObjectURL(file),
                isVideo: file.type.startsWith('video'),
                name: file.name
            }));
            setMediaList(prev => [...prev, ...newItems]);
        }
    };

    const handleRemove = (id) => {
        setMediaList(prev => prev.filter(item => item.id !== id));
    };

    return html`
        <div class="media-placeholder-box" style="margin-top: 14px; padding: 14px; border: 1px dashed rgba(0, 0, 0, 0.2); border-radius: 8px; text-align: center; background: rgba(0, 0, 0, 0.02); transition: all 0.3s ease;">
            
            ${mediaList.length > 0 ? html`
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; margin-bottom: 12px;">
                    ${mediaList.map(item => html`
                        <div key=${item.id} style="position: relative; border-radius: 6px; overflow: hidden; background: #000; height: 120px; border: 1px solid rgba(0,0,0,0.1);">
                            ${item.isVideo 
                                ? html`<video src=${item.url} controls style="width: 100%; height: 100%; object-fit: cover;"></video>`
                                : html`<img src=${item.url} alt="上传素材" style="width: 100%; height: 100%; object-fit: cover;" />`
                            }
                            <button 
                                onClick=${() => handleRemove(item.id)}
                                title="删除此素材"
                                style="position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,0.65); color: #fff; border: none; border-radius: 50%; width: 22px; height: 22px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;"
                            >✕</button>
                        </div>
                    `)}
                </div>
            ` : null}

            <label style="cursor: pointer; display: block; width: 100%; padding: 8px 0;">
                <i data-lucide="plus-circle" style="width: 26px; height: 26px; color: #333333; margin-bottom: 4px;"></i>
                <div style="font-size: 0.85rem; font-family: monospace; color: #333; font-weight: 600;">
                    ${mediaList.length > 0 ? '点击继续添加素材 (支持多图 / 多视频)' : '点击上传本地素材 (支持多图 / 多视频上传)'}
                </div>
                <div style="font-size: 0.75rem; color: var(--text-secondary, #666); margin-top: 2px;">
                    [ ${label} ]
                </div>
                <input type="file" accept="image/*,video/*" multiple onChange=${handleFileChange} style="display: none;" />
            </label>
        </div>
    `;
}

const renderMediaPlaceholder = (type, label) => html`<${MediaUploadBox} type=${type} label=${label} />`;

function App() {
    const [avatarUrl, setAvatarUrl] = useState('./assets/profile.jpg');
    const [theme, setTheme] = useState(() => {
        return localStorage.getItem('theme') || 'dark';
    });

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    useEffect(() => {
        if (window.lucide) window.lucide.createIcons();
    }, [avatarUrl]);

    const handleAvatarChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const url = URL.createObjectURL(file);
            setAvatarUrl(url);
        }
    };

    const renderAvatar = (size = 80, borderAccent = true) => html`
        <label style="cursor: pointer; display: inline-block; position: relative; margin: 0 auto;" title="点击选择照片上传头像">
            <img 
                src=${avatarUrl} 
                onError=${(e) => { e.target.onerror = null; e.target.src = 'https://api.dicebear.com/7.x/bottts/svg?seed=WeiTiantian'; }} 
                alt="魏甜甜头像" 
                style="width: ${size}px; height: ${size}px; border-radius: 50%; object-fit: cover; display: block; border: ${borderAccent ? '2px solid #333333' : '2px solid rgba(0,0,0,0.1)'}; transition: all 0.2s ease;" 
            />
            <div style="position: absolute; inset: 0; border-radius: 50%; background: rgba(0,0,0,0.4); opacity: 0; transition: opacity 0.2s; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #fff;" onMouseEnter=${(e) => e.currentTarget.style.opacity = '1'} onMouseLeave=${(e) => e.currentTarget.style.opacity = '0'}>
                <i data-lucide="camera" style="width: ${Math.max(16, size * 0.28)}px; height: ${Math.max(16, size * 0.28)}px;"></i>
            </div>
            <input type="file" accept="image/*" onChange=${handleAvatarChange} style="display: none;" />
        </label>
    `;

    useEffect(() => {
        const lenis = new window.Lenis({
            duration: 1.2,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), 
            direction: 'vertical',
            gestureDirection: 'vertical',
            smooth: true,
            mouseMultiplier: 1,
            smoothTouch: true,
            touchMultiplier: 2,
            infinite: false,
        });

        const handleAnchorClick = (e) => {
            const href = e.currentTarget.getAttribute('href');
            if (href && href.startsWith('#')) {
                e.preventDefault();
                lenis.scrollTo(href, { duration: 1.5 });
            }
        };

        const anchors = document.querySelectorAll('a[href^="#"]');
        anchors.forEach(anchor => {
            anchor.addEventListener('click', handleAnchorClick);
        });

        function raf(time) {
            lenis.raf(time);
            requestAnimationFrame(raf);
        }

        requestAnimationFrame(raf);

        return () => {
            anchors.forEach(anchor => {
                anchor.removeEventListener('click', handleAnchorClick);
            });
            lenis.destroy();
        };
    }, []);

    const toggleTheme = () => {
        setTheme(t => t === 'dark' ? 'light' : 'dark');
    };

    useEffect(() => {
        if (window.lucide) window.lucide.createIcons();
    });

    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('active');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0, rootMargin: "0px 0px -10% 0px" });

        document.querySelectorAll('.reveal').forEach(el => {
            observer.observe(el);
            const rect = el.getBoundingClientRect();
            if (rect.top < window.innerHeight) {
                el.classList.add('active');
            }
        });
        
        return () => observer.disconnect();
    }, []);

    const skillsData = [
        { type: 'lucide', icon: 'sparkles', name: 'DeepSeek / ChatGPT' },
        { type: 'lucide', icon: 'cpu', name: 'Coze / Workbuddy' },
        { type: 'simple', icon: 'python', name: 'Vibe Coding' },
        { type: 'lucide', icon: 'bar-chart-2', name: 'GEO / BI 看板' },
        { type: 'lucide', icon: 'database', name: 'SQL / Excel 数据映射' },
        { type: 'simple', icon: 'adobephotoshop', name: 'Photoshop (PS)' },
        { type: 'simple', icon: 'adobepremierepro', name: 'Premiere (PR)' },
        { type: 'lucide', icon: 'clapperboard', name: '剪映 / 视频剪辑' },
        { type: 'lucide', icon: 'image', name: 'Midjourney / 即梦' },
        { type: 'lucide', icon: 'palette', name: 'LibLib AI / 生图' },
        { type: 'lucide', icon: 'file-text', name: 'XMind 思维导图' },
        { type: 'lucide', icon: 'shopping-bag', name: '电商流量卡位' }
    ];

    const renderTerminalSkills = () => html`
        <section id="skills" class="reveal" style="margin-top: 40px;">
            <h2>核心技能栈与工具箱 / Skill Toolkit</h2>
            <div class="terminal-window">
                <div class="terminal-header">
                    <span class="dot dot-red"></span>
                    <span class="dot dot-yellow"></span>
                    <span class="dot dot-green"></span>
                </div>
                <div class="terminal-body font-mono">
                    <div class="terminal-command">
                        <span class="prompt">$</span> ls -l skills/
                    </div>
                    <div class="terminal-output">
                        ${skillsData.map(skill => html`
                            <div class="terminal-file">
                                ${skill.type === 'simple' 
                                    ? html`<img src="https://fastly.jsdelivr.net/npm/simple-icons@v13/icons/${skill.icon}.svg" alt=${skill.name} class="skill-icon" />` 
                                    : html`<i data-lucide=${skill.icon} class="skill-icon"></i>`}
                                <span>${skill.name}</span>
                            </div>
                        `)}
                    </div>
                </div>
            </div>
        </section>
    `;

    // 细化的二级标题 OptionWheel 导览项目
    const navWheelItems = [
        '履历与教育',
        '  └ 个人简介',
        '  └ 教育背景',
        '  └ 实习经历',
        '内容增长与 IP',
        '  └ 数码智玩 IP',
        '  └ 自营图书店铺',
        'AI 技能与应用',
        '  └ Vibe Coding 工具',
        '  └ Prompt & Skill 库',
        '视听作品',
        '  └ 微电影《人生头彩》',
        '  └ AIGC《成神》',
        '  └ AIGC《风雅姑苏》',
        '  └ 策划案、PPT制作',
        '  └ 排球社 VI 视觉设计',
        '  └ 其他 AI 视听作品',
        '  └ 其他平面作品',
        '核心工具箱'
    ];

    // 对应滚动跳转的元素 ID 数组
    const navWheelTargetIds = [
        '#experience-education',
        '#intro-bio',
        '#edu-background',
        '#internship-timeline',
        '#content-ip',
        '#ip-weibo',
        '#ip-store',
        '#ai-skills',
        '#vibe-coding-tools',
        '#skill-library',
        '#visual-arts',
        '#film-life',
        '#aigc-god',
        '#aigc-gusu',
        '#photography',
        '#volleyball-vi',
        '#ai-audiovisual',
        '#graphic-works',
        '#skills'
    ];

    return html`
        <button class="theme-toggle" onClick=${toggleTheme} aria-label="Toggle dark mode">
            <i data-lucide=${theme === 'dark' ? 'sun' : 'moon'}></i>
        </button>

        <!-- 页面主容器：最大宽度 980px，居中不贴边 -->
        <main class="container ow-main">

            <div class="ow-layout">

                <!-- 👈 纯粹悬浮的 3D 宋体黑字操作轮侧边栏 (带二级标题与灰色提示) -->
                <aside class="ow-aside">
                    <div style="font-size: 0.72rem; color: #888888; font-family: 'SimSun', 'Songti SC', 'STSong', serif; padding-left: 8px;">
                        可滚动滑轮点击跳转对应板块
                    </div>

                    <div style="height: 380px; position: relative;">
                        <${OptionWheel}
                            items=${navWheelItems}
                            defaultSelected=${0}
                            onChange=${(index) => {
                                const id = navWheelTargetIds[index];
                                const targetEl = document.querySelector(id);
                                if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth' });
                            }}
                            textColor="#666666"
                            activeColor="#000000"
                            side="left"
                            fontSize=${1.15}
                            spacing=${1.5}
                            curve=${0.85}
                            tilt=${8}
                            inset=${10}
                            draggable=${true}
                        />
                    </div>
                </aside>

                <!-- 👉 右侧主内容视窗 -->
                <div class="ow-content">
                    
                    <!-- 🌟 HERO 首屏（终端标题 + 4大核心数据网格） -->
                    <section class="hero-terminal reveal">
                        <div class="terminal-line font-mono"><span class="prompt">$</span> whoami</div>
                        
                        <h1 class="terminal-title">魏甜甜<br/><span class="terminal-accent-text">Wei Tiantian</span></h1>

                        <div class="terminal-line font-mono">
                            <span class="prompt">></span> <span class="typewriter">产品、内容、媒介、数据增长、AI提效</span>
                        </div>
                        
                        <div class="terminal-block">
                            <div class="terminal-comment">// 苏州大学 新闻与传播硕士（GPA 91.3 / 前 5%）| 中共党员</div>
                            <p class="terminal-text">3C数码 · 智能家电 · SaaS · AIGC · Vibe Coding · GEO</p>
                        </div>

                        <!-- 核心数据看板网格 (Metrics Grid) -->
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin: 20px 0;">
                            <div style="padding: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; text-align: center;">
                                <div style="font-size: 1.4rem; font-weight: bold; color: var(--terminal-accent, #00f2fe);">1,000,000+</div>
                                <div style="font-size: 0.75rem; color: var(--text-secondary);">自媒体总粉丝数</div>
                            </div>
                            <div style="padding: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; text-align: center;">
                                <div style="font-size: 1.4rem; font-weight: bold; color: var(--terminal-accent, #00f2fe);">1,800+</div>
                                <div style="font-size: 0.75rem; color: var(--text-secondary);">自营电商好评订单</div>
                            </div>
                            <div style="padding: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; text-align: center;">
                                <div style="font-size: 1.4rem; font-weight: bold; color: var(--terminal-accent, #00f2fe);">40%</div>
                                <div style="font-size: 0.75rem; color: var(--text-secondary);">AI 自动化工作流提效</div>
                            </div>
                            <div style="padding: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; text-align: center;">
                                <div style="font-size: 1.4rem; font-weight: bold; color: var(--terminal-accent, #00f2fe);">50+</div>
                                <div style="font-size: 0.75rem; color: var(--text-secondary);">合作变现品牌</div>
                            </div>
                        </div>

                        <div class="terminal-actions-wrapper">
                            <div class="terminal-actions-primary">
                                <a href="mailto:13546305848@163.com" class="terminal-btn active">
                                    <i data-lucide="mail"></i> 13546305848@163.com
                                </a>
                                <a href="tel:13004587368" class="terminal-btn">
                                    <i data-lucide="phone"></i> 13004587368
                                </a>
                                <a href="./assets/resume.pdf" download="魏甜甜-个人简历.pdf" class="terminal-btn">
                                    <i data-lucide="download"></i> 下载简历
                                </a>
                            </div>
                        </div>
                    </section>

                    <!-- 🌟 作品集核心导览卡片 (黑色标题) -->
                    <section id="nav-overview" class="reveal" style="margin-top: 30px; margin-bottom: 30px;">
                        <div class="glass-card" style="border-left: 4px solid var(--terminal-accent, #00f2fe);">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                                <i data-lucide="compass" style="color: var(--terminal-accent, #00f2fe); width: 24px; height: 24px;"></i>
                                <h2 style="margin: 0; font-size: 1.3rem;">作品集核心导览 / Portfolio Navigator</h2>
                            </div>
                            <p style="color: var(--text-secondary, #aaa); margin-bottom: 16px; font-size: 0.9rem;">
                                <strong>品类基因：</strong> 3C数码、智能家电、SaaS | <strong>核心优势：</strong> 自营店铺达1800+笔成交、百万粉丝账号实战、多种数据分析与 AIGC 熟练使用。点击下方直达：
                            </p>

                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
                                <a href="#experience-education" class="terminal-btn" style="display: flex; align-items: center; justify-content: space-between; padding: 12px; text-align: left; text-decoration: none;">
                                    <div>
                                        <!-- 分板块黑色标题 -->
                                        <div style="font-weight: bold; font-size: 0.95rem; color: #000000;">履历与教育背景</div>
                                        <div style="font-size: 0.75rem; color: var(--text-secondary);">苏州大学硕士、微盟/明基/追觅等7段实习</div>
                                    </div>
                                    <i data-lucide="arrow-right" style="width: 16px; height: 16px;"></i>
                                </a>

                                <a href="#content-ip" class="terminal-btn" style="display: flex; align-items: center; justify-content: space-between; padding: 12px; text-align: left; text-decoration: none;">
                                    <div>
                                        <!-- 分板块黑色标题 -->
                                        <div style="font-weight: bold; font-size: 0.95rem; color: #000000;">内容增长与自媒体 IP</div>
                                        <div style="font-size: 0.75rem; color: var(--text-secondary);">100W+粉丝自媒体、1800+订单自营店铺</div>
                                    </div>
                                    <i data-lucide="arrow-right" style="width: 16px; height: 16px;"></i>
                                </a>

                                <a href="#ai-skills" class="terminal-btn" style="display: flex; align-items: center; justify-content: space-between; padding: 12px; text-align: left; text-decoration: none;">
                                    <div>
                                        <!-- 分板块黑色标题 -->
                                        <div style="font-weight: bold; font-size: 0.95rem; color: #000000;">AI 技能与应用</div>
                                        <div style="font-size: 0.75rem; color: var(--text-secondary);">自研 Dashboard、Vibe Coding小工具、Skill库</div>
                                    </div>
                                    <i data-lucide="arrow-right" style="width: 16px; height: 16px;"></i>
                                </a>

                                <a href="#visual-arts" class="terminal-btn" style="display: flex; align-items: center; justify-content: space-between; padding: 12px; text-align: left; text-decoration: none;">
                                    <div>
                                        <!-- 分板块黑色标题 -->
                                        <div style="font-weight: bold; font-size: 0.95rem; color: #000000;">视听作品</div>
                                        <div style="font-size: 0.75rem; color: var(--text-secondary);">省一等奖微电影、AIGC《成神》、摄影及VI</div>
                                    </div>
                                    <i data-lucide="arrow-right" style="width: 16px; height: 16px;"></i>
                                </a>
                            </div>
                        </div>
                    </section>

                    <!-- 📌 履历与教育背景 -->
                    <section id="experience-education" class="reveal" style="margin-bottom: 40px;">
                        <div style="border-bottom: 2px solid #333333; padding-bottom: 6px; margin-bottom: 20px;">
                            <h2 style="margin: 0; font-size: 1.3rem; display: flex; align-items: center; gap: 8px;">
                                <i data-lucide="briefcase" style="color: #333333;"></i>
                                履历与教育背景 / Experience & Education
                            </h2>
                        </div>

                        <!-- 个人画像卡片 (锚点：#intro-bio) -->
                        <div id="intro-bio" class="glass-card" style="margin-bottom: 20px; display: flex; align-items: center; gap: 20px; flex-wrap: wrap;">
                            <div style="flex-shrink: 0; text-align: center;">
                                ${renderAvatar(96, true)}
                            </div>
                            <p style="margin: 0; font-size: 0.9rem; line-height: 1.6; flex: 1; min-width: 220px;">
                                魏甜甜，24岁，中共党员，苏州大学新闻与传播硕士在读（2024.09 - 2027.06，课程均分 91.3 / 前5%）。具备百万粉丝自媒体从 0 到 1 搭建运营经验、头部科技企 PR 及电商短视频爆款转化能力，熟练掌握 AI Agent / Vibe Coding 看板开发与全流程视听内容生产。
                            </p>
                        </div>

                        <!-- 教育背景卡片 (锚点：#edu-background，无图片占位框) -->
                        <div id="edu-background" class="glass-card" style="margin-bottom: 20px;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">
                                <div>
                                    <h3 style="margin: 0; font-size: 1.1rem;">苏州大学 (Soochow University)</h3>
                                    <div style="font-size: 0.88rem; font-weight: 600; margin-top: 2px;">新闻与传播硕士 (2024.09 - 2027.06)</div>
                                </div>
                                <div class="font-mono" style="color: var(--text-secondary); font-size: 0.85rem;">均分：91.3 (前 5%) | 班长</div>
                            </div>
                            <p style="margin-top: 8px; font-size: 0.85rem; color: var(--text-secondary);">
                                课程：广告策划、影视产业研究、品牌传播、网络传播学。荣获优秀毕业生、三好学生、优秀学生干部、优秀研究生干部等荣誉。
                            </p>
                            <hr style="border: 0; border-top: 1px solid rgba(0,0,0,0.1); margin: 10px 0;" />
                            <h4 style="margin-bottom: 6px; font-size: 0.9rem;">竞赛荣誉：</h4>
                            <ul style="padding-left: 18px; font-size: 0.85rem; line-height: 1.5; margin: 0;">
                                <li><strong>建行杯江苏大学生创新大赛（2025）</strong> | 省赛银奖（《新智出海》项目负责人）</li>
                                <li><strong>第 13 届未来设计师全国高校数字艺术设计大赛</strong> | 省级一等奖（《人生头彩》微电影）</li>
                                <li><strong>江苏省研究生新媒体节</strong> | AIGC 赛道省级优秀奖（《风雅姑苏》）</li>
                            </ul>
                        </div>

                        <!-- 实习履历 (锚点：#internship-timeline) -->
                        <h3 id="internship-timeline" style="margin-bottom: 14px; font-size: 1.05rem;">实习经历时间轴-详细见附件简历</h3>
                        <div class="timeline">
                            <div class="timeline-item">
                                <div class="timeline-role">产品运营 / 策略分析运营</div>
                                <div class="timeline-company">上海微盟企业发展有限公司</div>
                                <div class="timeline-date font-mono" style="color: var(--text-secondary); margin-bottom: 6px;">2026.03 - 2026.06</div>
                                <p>负责近 40 家中小企业客户需求调研，搭建 GEO 看板监测排名波动；设计 A/B 实验优化 AI 推荐率，搭建 Coze/Workbuddy 自动化工作流提效 40%。</p>
                            </div>

                            <div class="timeline-item">
                                <div class="timeline-role">媒介 PR / 内容运营</div>
                                <div class="timeline-company">明基智能科技有限公司</div>
                                <div class="timeline-date font-mono" style="color: var(--text-secondary); margin-bottom: 6px;">2025.11 - 2026.02</div>
                                <p>建立达人合作库，触达 100+ 垂类达人并建立 20+ 合作意向；负责明基影院小红书官方账号定位及垂直栏目策划。</p>
                            </div>

                            <div class="timeline-item">
                                <div class="timeline-role">项目管理</div>
                                <div class="timeline-company">苏州培风图南半导体公司</div>
                                <div class="timeline-date font-mono" style="color: var(--text-secondary); margin-bottom: 6px;">2025.07 - 2025.11</div>
                                <p>协助进行项目周期与节点管理，进行跨部门进度协调；熟练运用 Excel 数据映射与 ERP 软件。</p>
                            </div>

                            <div class="timeline-item">
                                <div class="timeline-role">视频剪辑 / 类目推广与转化</div>
                                <div class="timeline-company">苏州追觅科技有限公司</div>
                                <div class="timeline-date font-mono" style="color: var(--text-secondary); margin-bottom: 6px;">2025.04 - 2025.07</div>
                                <p>负责 MOVA 洗地机抖音短视频剪辑，优化“黄金 3 秒钩子”，产出 200+ 高赞切片素材，持续监控 CTR 及引流进店数据。</p>
                            </div>

                            <div class="timeline-item">
                                <div class="timeline-role">媒体策划</div>
                                <div class="timeline-company">山西美映科技有限公司</div>
                                <div class="timeline-date font-mono" style="color: var(--text-secondary); margin-bottom: 6px;">2024.04 - 2024.07</div>
                                <p>负责“螳螂斯基”抖音账号内容选题、脚本撰写、视频拍摄及全流程后期剪辑。</p>
                            </div>

                            <div class="timeline-item">
                                <div class="timeline-role">广告客户执行 (AE) / 新媒体编辑</div>
                                <div class="timeline-company">山西喜鹊文化 / 山西巨点时代</div>
                                <div class="timeline-date font-mono" style="color: var(--text-secondary); margin-bottom: 6px;">2021.09 - 2023.04</div>
                                <p>对接万科、绿城等地产客户；负责教育类微信公众号内容撰写与排版。</p>
                            </div>
                        </div>
                    </section>

                    <!-- 📌 内容增长与自媒体 IP (仅保留两个项目) -->
                    <section id="content-ip" class="reveal" style="margin-bottom: 40px;">
                        <div style="border-bottom: 2px solid #333333; padding-bottom: 6px; margin-bottom: 20px;">
                            <h2 style="margin: 0; font-size: 1.3rem; display: flex; align-items: center; gap: 8px;">
                                <i data-lucide="trending-up" style="color: #333333;"></i>
                                内容增长与自媒体 IP / Content Growth & IP
                            </h2>
                        </div>

                        <div class="timeline">
                            <div id="ip-weibo" class="timeline-item">
                                <div class="timeline-role">微博“数码智玩” (100W+ 粉丝自媒体 IP)</div>
                                <div class="timeline-company">从 0 到 1 运营与品牌变现</div>
                                <p>从 0 搭建数码垂类自媒体，微博粉丝突破 100 万，产出 2000+ 条内容，单篇最高曝光 50w+，视频 20w+，成功变现服务小米、vivo、漫步者等 50+ 品牌。</p>
                                <div class="work-image"><img src="./assets/works/weibo-shumazhiwan.jpg" alt="微博数码智玩百万账号截图" loading="lazy" /></div>
                            </div>

                            <div id="ip-store" class="timeline-item">
                                <div class="timeline-role">小红书/闲鱼 自营图书店铺 (1800+ 笔成交)</div>
                                <div class="timeline-company">轻量化副业 & 流量卡位</div>
                                <p>独立负责线上店铺规划与分级定价，设计“主词+行业热词+长尾词”与同义词矩阵铺货卡位，重置发布时间权重，达成 1800+ 成交单，好评率 100%。</p>
                            </div>
                        </div>
                    </section>

                    <!-- 📌 AI 技能与应用 -->
                    <section id="ai-skills" class="reveal" style="margin-bottom: 40px;">
                        <div style="border-bottom: 2px solid #333333; padding-bottom: 6px; margin-bottom: 20px;">
                            <h2 style="margin: 0; font-size: 1.3rem; display: flex; align-items: center; gap: 8px;">
                                <i data-lucide="cpu" style="color: #333333;"></i>
                                AI 技能与应用 / AI Skills & Vibe Coding
                            </h2>
                        </div>

                        <h3 id="vibe-coding-tools" style="margin-bottom: 12px; font-size: 1.05rem;">01. Vibe Coding 工具与交互看板</h3>
                        <div class="timeline" style="margin-bottom: 28px;">
                            <div class="timeline-item">
                                <div class="timeline-role">大健康行业多维数据 Dashboard</div>
                                <div class="timeline-company">自研可视化交互看板</div>
                                <p>解决大健康/医疗客户经营数据、项目进度、品牌可见度分散在不同 Excel 的痛点，自研一站式可视化交互看板。</p>
                                <div class="work-image"><img src="./assets/works/dashboard-dahealth.png" alt="大健康行业多维数据Dashboard" loading="lazy" /></div>
                            </div>

                            <div class="timeline-item">
                                <div class="timeline-role">周期运营数据与交付内容看板</div>
                                <div class="timeline-company">固定交付流程设计</div>
                                <p>针对多元客户交付内容同质化问题，设计交互看板以提效并增强内容说服力。</p>
                                <div class="work-image"><img src="./assets/works/geo-report-linya.png" alt="周期运营数据与交付内容看板" loading="lazy" /></div>
                            </div>

                            <!-- 新增：快速出图 html -->
                            <div class="timeline-item">
                                <div class="timeline-role">快速出图 html</div>
                                <div class="timeline-company">Vibe Coding 效率小工具</div>
                                <p>一个用于快速出图、快速批量生成素材的小工具，极大地提升内容生产与视觉落地效率。</p>
                                <div class="work-image-grid">
                                    <div class="work-image"><img src="./assets/works/kuaitu-1.png" alt="快速出图工具演示1" loading="lazy" /></div>
                                    <div class="work-image"><img src="./assets/works/kuaitu-2.png" alt="快速出图工具演示2" loading="lazy" /></div>
                                </div>
                            </div>

                            <div class="timeline-item">
                                <div class="timeline-role">表情包转 HTML 工具 (Meme to HTML)</div>
                                <div class="timeline-company">Vibe Coding 趣味应用</div>
                                <p>通过图像与文本解析，自动将表情包转化为富文本或 HTML 布局代码。</p>
                                <div class="work-image"><img src="./assets/works/biaoqingbao-html.png" alt="表情包转HTML工具演示" loading="lazy" /></div>
                            </div>

                            <div class="timeline-item">
                                <div class="timeline-role">灵感收集器 (Inspiration Collector)</div>
                                <div class="timeline-company">轻量创意管理工具</div>
                                <p>支持标签化分类与快速检索的轻量创意收集小工具，提升日常内容策划效率。</p>
                                <div class="work-image"><img src="./assets/works/inspiration-collector.png" alt="灵感收集器 UI 截图" loading="lazy" /></div>
                            </div>

                            <div class="timeline-item">
                                <div class="timeline-role">奶茶日历 (Milk Tea Calendar)</div>
                                <div class="timeline-company">Web 趣味打卡小应用</div>
                                <p>结合日历展示奶茶打卡记录、打折信息及随机推荐的趣味小应用。</p>
                                <div class="work-image-grid">
                                    <div class="work-image"><img src="./assets/works/naicha-1.png" alt="奶茶日历应用截图1" loading="lazy" /></div>
                                    <div class="work-image"><img src="./assets/works/naicha-2.jpg" alt="奶茶日历应用截图2" loading="lazy" /></div>
                                </div>
                            </div>
                        </div>

                        <!-- Skill 库（精简版） -->
                        <h3 id="skill-library" style="margin-bottom: 12px; font-size: 1.05rem;">02. AI Prompt & Skill 代码库</h3>
                        <div class="timeline">
                            <div class="timeline-item">
                                <div class="timeline-role">审核文章 Skill (Content Audit)</div>
                                <div class="timeline-company">合规与质量自动排查</div>
                                <p>输入推文草稿，自动排查敏感词、违规红线、逻辑断层，输出标准化修改建议。</p>
                                <div class="work-image"><img src="./assets/works/skill-review.png" alt="审核文章Skill效果截图" loading="lazy" /></div>
                            </div>

                            <div class="timeline-item">
                                <div class="timeline-role">提炼客户品牌定位 Skill (Brand Positioning)</div>
                                <div class="timeline-company">商业信息结构化抽提</div>
                                <p>输入客户访谈及杂乱资料，自动抽取核心卖点、目标客群并生成品牌定位模型。</p>
                                <div class="work-image"><img src="./assets/works/skill-brand-positioning.png" alt="品牌定位提炼Skill输出" loading="lazy" /></div>
                            </div>

                            <div class="timeline-item">
                                <div class="timeline-role">内容质量审核与合规风控 (Risk Control) Skill</div>
                                <div class="timeline-company">高壁垒品类合规控制</div>
                                <p>针对大健康、医美、食品等高壁垒品类制定资质审核与合规排查策略。</p>
                                <div class="work-image"><img src="./assets/works/skill-risk-control.png" alt="合规风控Skill架构图" loading="lazy" /></div>
                            </div>
                        </div>
                    </section>

                    <!-- 📌 视听作品 (重命名并替换《成神》) -->
                    <section id="visual-arts" class="reveal" style="margin-bottom: 40px;">
                        <div style="border-bottom: 2px solid #333333; padding-bottom: 6px; margin-bottom: 20px;">
                            <h2 style="margin: 0; font-size: 1.3rem; display: flex; align-items: center; gap: 8px;">
                                <i data-lucide="clapperboard" style="color: #333333;"></i>
                                视听作品 / Audio-Visual Works
                            </h2>
                        </div>

                        <div class="timeline">
                            <div id="film-life" class="timeline-item">
                                <div class="timeline-role">微电影《人生头彩》</div>
                                <div class="timeline-company">第 13 届未来设计师全国高校数字艺术设计大赛【省级一等奖】</div>
                                <p>负责微电影全流程脚本统筹、拍摄及后期剪辑，用镜头展现细腻的情感与视听逻辑。</p>
                                <div class="work-video-grid">
                                    <video class="work-video" src="./assets/works/rensheng-toucai.mp4" controls preload="metadata"></video>
                                </div>
                            </div>

                            <!-- 替换为：AIGC作品《成神》 -->
                            <div id="aigc-god" class="timeline-item">
                                <div class="timeline-role">AIGC作品《成神》</div>
                                <div class="timeline-company">AIGC 叙事短片创作</div>
                                <p>一个关于数据托付云端和反云端的故事，探索数字时代人性与科技张力。</p>
                                <div class="work-image"><img src="./assets/works/aigc-god.png" alt="AIGC作品《成神》" loading="lazy" /></div>
                            </div>

                            <div id="aigc-gusu" class="timeline-item">
                                <div class="timeline-role">AIGC 城市系列《风雅姑苏》</div>
                                <div class="timeline-company">江苏省研究生新媒体节【AIGC 赛道省级优秀奖】</div>
                                <p>熟练运用 Midjourney、即梦、LibLib AI 等生成式 AI 工具创作江南水乡审美视觉作品。</p>
                                <div class="work-image"><img src="./assets/works/aigc-gusu.png" alt="AIGC《风雅姑苏》艺术作品" loading="lazy" /></div>
                            </div>

                            <div id="photography" class="timeline-item">
                                <div class="timeline-role">策划案、PPT制作</div>
                                <div class="timeline-company">建行杯江苏大学生创新大赛（2025）| 省赛银奖（《新智出海》项目负责人）<br>越秀乳业第二届全国大学生营销大赛 | 优秀奖</div>
                                <div class="work-image"><img src="./assets/works/ppt-jianxingbei.png" alt="建行杯省赛银奖《新智出海》PPT" loading="lazy" /></div>
                                <div class="work-image"><img src="./assets/works/ppt-yuexiu.png" alt="越秀乳业营销大赛策划案PPT" loading="lazy" /></div>
                            </div>

                            <div id="volleyball-vi" class="timeline-item">
                                <div class="timeline-role">排球社全套 VI 视觉设计</div>
                                <div class="timeline-company">山西传媒学院排球社</div>
                                <p>主导社团组建，独立完成 LOGO、宣传海报及全套视觉物料设计。</p>
                                <div class="work-image"><img src="./assets/works/volleyball-vi.png" alt="排球社VI视觉设计展板" loading="lazy" /></div>
                            </div>

                            <div id="ai-audiovisual" class="timeline-item">
                                <div class="timeline-role">其他 AI 视听作品</div>

                                <div class="timeline-subtitle">数字人</div>
                                <div class="work-video-grid">
                                    <video class="work-video" src="./assets/works/tumi-digital-human-01.mp4" controls preload="metadata"></video>
                                    <video class="work-video" src="./assets/works/tumi-digital-human-02.mp4" controls preload="metadata"></video>
                                </div>

                                <div class="timeline-subtitle">纯素材 TVC</div>
                                <div class="work-video-grid">
                                    <video class="work-video" src="./assets/works/tumi-tvc-pure-01.mp4" controls preload="metadata"></video>
                                    <video class="work-video" src="./assets/works/tumi-tvc-pure-02.mp4" controls preload="metadata"></video>
                                </div>

                                <div class="timeline-subtitle">图文</div>
                                <div class="work-image-grid">
                                    <div class="work-image"><img src="./assets/works/tumi-luggage-guide.png" alt="TUMI行李箱攻略图文" loading="lazy" /></div>
                                    <div class="work-image"><img src="./assets/works/honghaofu-giftbox.png" alt="弘好福礼盒图文" loading="lazy" /></div>
                                </div>
                            </div>

                            <div id="graphic-works" class="timeline-item">
                                <div class="timeline-role">其他平面作品</div>

                                <div class="timeline-subtitle">品牌 VI 系统</div>
                                <div class="work-image-grid">
                                    <div class="work-image"><img src="./assets/works/brand-vi-logos.png" alt="品牌Logo设计合集" loading="lazy" /></div>
                                    <div class="work-image"><img src="./assets/works/brand-vi-packaging.png" alt="品牌包装视觉系统" loading="lazy" /></div>
                                    <div class="work-image"><img src="./assets/works/brand-vi-snack-bags.png" alt="零食袋包装设计" loading="lazy" /></div>
                                    <div class="work-image"><img src="./assets/works/brand-vi-cover-jiaogao.png" alt="阿胶糕封面设计" loading="lazy" /></div>
                                    <div class="work-image"><img src="./assets/works/brand-vi-detail-page.png" alt="详情页视觉设计" loading="lazy" /></div>
                                </div>

                                <div class="timeline-subtitle">地产物料</div>
                                <div class="work-image-grid">
                                    <div class="work-image"><img src="./assets/works/realestate-wanke-travel.png" alt="万科旅行主题海报" loading="lazy" /></div>
                                    <div class="work-image"><img src="./assets/works/realestate-wanke-collage1.png" alt="万科地产海报合集1" loading="lazy" /></div>
                                    <div class="work-image"><img src="./assets/works/realestate-park-banner.png" alt="私属公园好房banner" loading="lazy" /></div>
                                    <div class="work-image"><img src="./assets/works/realestate-wanke-collage2.png" alt="万科地产海报合集2" loading="lazy" /></div>
                                    <div class="work-image"><img src="./assets/works/realestate-wanke-posters.png" alt="万科地产推广海报集" loading="lazy" /></div>
                                </div>

                                <div class="timeline-subtitle">封面设计</div>
                                <div class="work-image-grid">
                                    <div class="work-image"><img src="./assets/works/cover-design-books.png" alt="书籍封面设计合集" loading="lazy" /></div>
                                </div>
                            </div>
                        </div>
                    </section>

                    <!-- 技能栈分类 -->
                    ${renderTerminalSkills()}

                </div>
            </div>

        </main>

        <footer class="site-footer" style="margin-top: 50px;">
            <div class="footer-container">
                <div class="footer-left">
                    <div class="footer-profile" style="display: flex; align-items: center; gap: 10px;">
                        ${renderAvatar(40, false)}
                        <div class="footer-profile-text">
                            <div class="footer-name">魏甜甜.</div>
                            <div class="footer-subtitle">全栈 AI 提效 × 数据增长专家</div>
                        </div>
                    </div>
                    <div class="footer-copyright">
                        <p>© 2026 魏甜甜 (Wei Tiantian). 保留所有权利。</p>
                        <p>苏州大学 新闻与传播硕士 | 13004587368 | 13546305848@163.com</p>
                    </div>
                </div>
                <div class="footer-right">
                    <div class="footer-group">
                        <div class="footer-heading">快速导航</div>
                        <div class="footer-links">
                            <a href="#experience-education">履历与教育</a>
                            <a href="#content-ip">内容增长与 IP</a>
                            <a href="#ai-skills">AI 技能应用</a>
                            <a href="#visual-arts">视听作品</a>
                            <a href="#skills">技能工具箱</a>
                        </div>
                    </div>
                    <div class="footer-group">
                        <div class="footer-heading">联系方式</div>
                        <div class="footer-socials">
                            <a href="tel:13004587368" class="footer-social-btn" aria-label="Phone">
                                <i data-lucide="phone"></i>
                            </a>
                            <a href="mailto:13546305848@163.com" class="footer-social-btn" aria-label="Email">
                                <i data-lucide="mail"></i>
                            </a>
                            <a href="./assets/resume.pdf" download="魏甜甜-个人简历.pdf" class="footer-social-btn" aria-label="下载附件简历" style="width: auto; padding: 0 14px; gap: 6px; text-decoration: none; font-family: var(--font-sans);">
                                <i data-lucide="file-down" style="width: 16px; height: 16px;"></i>
                                <span style="font-size: 0.82rem; font-weight: 500;">下载简历</span>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    `;
}

render(html`<${App} />`, document.getElementById('app'));