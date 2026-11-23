(() => {
  'use strict';

  const $ = (selector, parent = document) => parent.querySelector(selector);
  const all = (selector, parent = document) => Array.from(parent.querySelectorAll(selector));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = gsap.utils.clamp(0, 1);
  gsap.registerPlugin(ScrollTrigger, SplitText);

  const lenis = new Lenis({autoRaf: true, lerp: .0225, duration: 1.2, wheelMultiplier: 1.25, smoothWheel: !reduced.matches});
  lenis.on('scroll', ScrollTrigger.update);

  function navigate(y) {
    lenis.scrollTo(y, {immediate: reduced.matches});
  }

  // Sticky sections report their pinned position. Sibling markers remain in normal flow.
  function sectionTop(section) {
    const marker = $('[class$="_markers"]', section);
    return marker ? marker.getBoundingClientRect().top + scrollY - marker.offsetTop :
      Array.from(section.parentNode.children).slice(0, Array.from(section.parentNode.children).indexOf(section) + 1)
        .reduce((y, sibling) => y + parseFloat(getComputedStyle(sibling).marginTop) +
          (sibling === section ? 0 : sibling.offsetHeight), 0);
  }

  for (const link of all('a[href^="#"]')) {
    const section = document.getElementById(link.hash.slice(1));
    if (!section) continue;
    link.addEventListener('click', event => {
      event.preventDefault();
      const offset = Number(link.dataset.scrollOffsetVh || 0) * innerHeight / 100 +
        Number(link.dataset.scrollOffsetRem || 0) * parseFloat(getComputedStyle(document.documentElement).fontSize);
      navigate(sectionTop(section) + offset);
    });
  }

  const intro = $('.preloader');
  const introStart = performance.now();
  function handoff() {
    document.dispatchEvent(new Event('snapa:preloaderDone'));
  }

  function runIntro() {
    if (reduced.matches || location.hash || scrollY > 1) {
      intro.hidden = true;
      handoff();
      return;
    }

    const logo = $('.preloader_logo');
    const tracks = [];
    const rowHeight = logo.firstElementChild.getBoundingClientRect().height * 1.5;
    const padding = rowHeight / 6;
    let loop;
    let ready = false;
    let done = false;

    for (const letter of logo.children) {
      const mask = document.createElement('span');
      const track = document.createElement('span');
      mask.className = 'letter-mask';
      mask.style.height = rowHeight + 'px';
      track.className = 'letter-track';
      track.style.flexDirection = 'column';
      track.style.gap = rowHeight * .2 + 'px';
      for (let i = 0; i < 2; i++) {
        const row = document.createElement('span');
        row.className = 'letter-row';
        row.textContent = letter.textContent;
        row.style.height = rowHeight + 'px';
        track.append(row);
      }
      mask.append(track);
      letter.replaceChildren(mask);
      tracks.push({track, rowHeight});
    }

    function finish() {
      if (done) return;
      done = true;
      loop?.kill();
      gsap.set(tracks.map(item => item.track), {y: 0});
      const from = logo.getBoundingClientRect();
      const target = $('.hero_logo').getBoundingClientRect();
      gsap.set(logo, {position: 'fixed', left: from.left, top: from.top});
      handoff();
      gsap.timeline({onComplete: () => { intro.hidden = true; }})
        .to(logo, {left: target.left, top: target.top - padding, duration: .6, ease: 'power2.inOut'})
        .to(intro, {opacity: 0, duration: .5, ease: 'power2.out'});
    }

    const enter = gsap.timeline({onComplete: () => {
      if (ready) return finish();
      loop = gsap.timeline({repeat: -1, onRepeat: () => { if (ready) finish(); }});
      tracks.forEach(({track, rowHeight}, i) => {
        loop.fromTo(track, {y: 0}, {y: -1.2 * rowHeight, duration: 1.2, ease: 'power2.inOut'}, i * .24);
      });
    }});
    enter.to(logo, {opacity: 1, duration: .9, ease: 'power2.out'}, 0);
    tracks.forEach(({track, rowHeight}, i) => {
      enter.fromTo(track, {y: rowHeight}, {y: 0, duration: .9, ease: 'power3.out'}, i * .08);
    });
    const loaded = document.readyState === 'complete' ? Promise.resolve() :
      new Promise(resolve => window.addEventListener('load', resolve, {once: true}));
    Promise.all([loaded, new Promise(resolve => setTimeout(resolve, Math.max(0, 2000 - (performance.now() - introStart))))]).then(() => { ready = true; });
    setTimeout(() => { ready = true; }, Math.max(0, 8000 - (performance.now() - introStart)));
  }

  const featureButtons = all('.feature-scroll_list-item');
  const slides = all('.feature-scroll_image-slide');
  const ergo = all('.mask-scroll_screen');
  const photos = all('.choose_screen');
  const names = all('.choose_name');
  const next = $('.choose-next');
  const badges = all('.control_step');
  const phoneItems = badges.map((_, i) => $('.control_item.step-' + (i + 1)));
  const phoneImages = badges.map((_, i) => $('.control_phone-screen.step-' + (i + 1)));
  const titleItem = $('.control_title-item');
  let phoneWords = [];
  let featureGate = false;
  let featurePending = 0;
  let clickLock = 0;
  let preset = 0;
  let phoneStep = -1;
  let pendingPhone;
  let phoneLock = 0;
  let revealErgo = () => {};
  function setFeature(index) {
    slides.forEach((slide, i) => {
      slide.classList.toggle('is-active', i === index);
      slide.classList.toggle('is-prev', i < index);
      slide.classList.toggle('is-next', i > index);
      featureButtons[i].classList.toggle('list-item-active', i === index);
      featureButtons[i].setAttribute('aria-pressed', String(i === index));
    });
  }
  function setPreset(index) {
    preset = index;
    photos.forEach((el, i) => {
      el.classList.toggle('is-next', i > index);
      names[i].classList.toggle('is-prev', i < index);
      names[i].classList.toggle('is-next', i > index);
    });
    $('.choose_circle').style.transform = 'rotate(' + (-90 * index) + 'deg)';
    $('.choose_num').textContent = String(index + 1).padStart(2, '0');
    next.setAttribute('aria-label', 'Next preset. Current preset: ' + names[index].textContent.trim());
  }
  const shrinkMarker = $('.choose_shrink-marker');
  const postcard = $('.choose_pin');
  const dialParts = all('.choose_title,.choose_name-wrap,.choose_circles-wrap');
  let previousMorph = {};
  function morph() {
    const fraction = clamp(1 - shrinkMarker.getBoundingClientRect().top / innerHeight);
    const progress = reduced.matches ? Number(fraction >= .5) : fraction;
    if (previousMorph.progress === progress && previousMorph.width === innerWidth &&
        previousMorph.height === innerHeight) return;
    previousMorph = {progress, width: innerWidth, height: innerHeight};
    const mobile = innerWidth <= 767, tablet = !mobile && innerWidth <= 991;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const w = gsap.utils.interpolate(innerWidth, rem * (mobile ? 13.5 : tablet ? 22.40625 : 32.8125), progress);
    const h = gsap.utils.interpolate(innerHeight, rem * (mobile ? 15.1875 : tablet ? 25.3125 : 29.0625), progress);
    const y = (innerHeight - h) / 2 + (mobile ? .05 : tablet ? 0 : -.1) * innerHeight * progress;
    postcard.style.width = w + 'px';
    postcard.style.height = h + 'px';
    postcard.style.transform = 'translateY(' + y + 'px) rotate(' + (-5 * progress) + 'deg)';
    for (const el of dialParts) {
      el.style.transform = mobile || tablet ? 'translateY(' + (100 * progress) + 'vh)' :
        'translateX(' + ((el.matches('h2') ? -120 : 120) * progress) + 'vw)';
    }
    next.hidden = progress > .01;
  }

  function animate(target, from, to, delay = 0) {
    if (!target || !gsap.utils.toArray(target).length) return;
    gsap.killTweensOf(target);
    if (reduced.matches) gsap.set(target, {...to, duration: 0, stagger: 0});
    else gsap.fromTo(target, from, {...to, delay, overwrite: 'auto'});
  }
  function showPhone(index) {
    if (index === phoneStep) return;
    const old = phoneStep;
    phoneStep = index;
    const tablet = innerWidth > 767 && innerWidth <= 991;
    const delay = tablet && old > 0 ? .1 : 0;
    const dt = reduced.matches ? 0 : 1;
    const out = {opacity: 0, duration: .4 * dt, ease: 'power2.in', overwrite: true};
    pendingPhone?.kill();
    if (!index || old === 0 && innerWidth > 991) gsap.to(titleItem, {...out, yPercent: -20});
    badges.forEach((badge, i) => {
      const active = index === i + 1;
      badge.setAttribute('aria-pressed', String(active));
      $('.step_title', badge).classList.toggle('is-active', active);
      phoneItems[i].setAttribute('aria-hidden', String(!active));
      if (old === i + 1) {
        gsap.to(phoneItems[i], {...out, yPercent: tablet ? 0 : -20, duration: (tablet ? .1 : .4) * dt});
        if (i) gsap.to(phoneImages[i], out);
        gsap.to(badge, {...out, opacity: .2});
      }
    });
    if (index === 0) {
      animate(titleItem, {opacity: 0, yPercent: 20}, {opacity: 1, yPercent: 0, duration: .6, ease: 'power2.out'}, delay);
      animate(phoneWords, {yPercent: 100}, {yPercent: 0, duration: .5, ease: 'power2.out', stagger: .03}, delay + .4);
      return;
    }
    if (innerWidth <= 991 && old < 0) gsap.set(titleItem, {opacity: 1});
    const i = index - 1;
    const enter = () => {
      const to = {opacity: 1, duration: .5, ease: 'power2.out'};
      animate(phoneItems[i], {opacity: 0, yPercent: 20}, {...to, yPercent: 0});
      animate($('.control_item-line',phoneItems[i]), {width: '0%'}, {width: '100%', duration: .5, ease: 'power2.out'});
      if (i) animate(phoneImages[i], {scale: .9, opacity: 0}, {...to, scale: 1});
      animate(badges[i], {opacity: .2}, to);
    };
    if (delay && dt) pendingPhone = gsap.delayedCall(delay, enter);
    else enter();
  }

  function observe(selector, change) {
    const markers = all(selector);
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) change(markers.indexOf(entry.target));
    }, {threshold: .5});
    markers.forEach(marker => observer.observe(marker));
    return markers;
  }
  setFeature(0);
  setPreset(0);
  ergo.forEach((el, i) => el.classList.toggle('is-next', i > 0));

  function unlockFeatures() {
    if (featureGate || scrollY < sectionTop($('#Characteristics')) + innerHeight * .25) return;
    featureGate = true;
    setFeature(featurePending);
  }
  window.addEventListener('scroll', unlockFeatures, {passive: true});
  const featureMarkers = observe('.feature-scroll_marker', index => {
    if (performance.now() < clickLock) return;
    featurePending = index;
    if (featureGate) setFeature(index);
    else unlockFeatures();
  });
  observe('.mask-scroll_marker', index => {
    ergo.forEach((el, i) => {
      el.classList.toggle('is-next', i > index);
      el.setAttribute('aria-hidden', String(i !== index));
    });
    revealErgo(index);
  });
  const chooseMarkers = observe('.choose_marker', setPreset);
  const phoneMarkers = all('.control_marker');
  function go(marker) { navigate(marker.getBoundingClientRect().top + scrollY + 20); }
  function bindSteps(buttons, select) {
    buttons.forEach((button, i) => {
      button.addEventListener('click', () => select(i));
      button.addEventListener('keydown', event => {
        const dir = {ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1}[event.key];
        if (!dir) return;
        event.preventDefault();
        const target = (i + buttons.length + dir) % buttons.length;
        buttons[target].focus({preventScroll: true});
        select(target);
      });
    });
  }
  bindSteps(featureButtons, i => {
    featureGate = true;
    clickLock = performance.now() + 1400;
    setFeature(i);
    go(featureMarkers[i]);
  });
  bindSteps(badges, i => {
    phoneLock = performance.now() + 1400;
    showPhone(i + 1);
    go(phoneMarkers[i + 1]);
  });
  next.addEventListener('click', () => go(chooseMarkers[(preset + 1) % names.length]));
  window.addEventListener('scroll', morph, {passive: true});
  window.addEventListener('resize', morph);
  morph();

  // Build masks from actual line breaks at the current font metrics and viewport.
  let entrancePlayed = false;
  function scenes() {
    const splits = [];
    function lines(selector, name) {
      return all(selector).flatMap(el => {
        const split = SplitText.create(el, {type: 'lines', mask: 'lines', linesClass: name + 'Line', aria: el.matches('h1,h2,h3') ? 'auto' : 'none'});
        splits.push(split);
        return split.lines;
      });
    }
    function reveal(tl, targets, duration, stagger, pos) {
      return tl.fromTo(targets, {yPercent: 100}, {yPercent: 0, duration, stagger, ease: 'power3.out'}, pos);
    }
    function entry(selector, start = 'top top') {
      return gsap.timeline({scrollTrigger: {trigger: selector, start, toggleActions: 'play none none reverse'}});
    }
    function scrub(target, from, to, trigger, start, end) {
      gsap.fromTo(target, from, {...to, ease: 'none', scrollTrigger: {trigger, start, end, scrub: true}});
    }
    const title = lines('.hero_title','heroTitle'), sub = lines('.hero_sub','heroSub');
    const hero = gsap.timeline({paused: true});
    hero.fromTo('.hero_bg', {scale: 1.2}, {scale: 1, duration: 1.5, ease: 'power2.out'})
      .fromTo('.hero_navbar > *', {opacity: 0,yPercent: 50}, {opacity: 1,yPercent: 0,duration: .5,stagger: .1,ease: 'power2.out'})
      .addLabel('copy');
    reveal(hero,title,.7,.08,'copy');reveal(hero,sub,.5,.06,'copy');
    const playHero = () => { entrancePlayed = true; hero.play(); };
    if (entrancePlayed) hero.progress(1);
    else document.addEventListener('snapa:preloaderDone',playHero,{once:true});
    const about = entry('#about');
    reveal(about,lines('.about_title','aboutTitle'),.8,.08,0);
    reveal(about,lines('.about_sub','aboutSub'),.6,.06,'-=0.5');
    const features = entry('#Characteristics');
    reveal(features,lines('.feuture-scroll_title','featureScrollTitle'),.7,.06,0);
    featureButtons.forEach((button,i) => {
      const t = .35 + i * .15;
      for (const [sel,cls] of [['.list-item_num','listItemNum'],['.list-item_title','listItemTitle']]) {
        reveal(features, lines('.feature-scroll_list-item:nth-child('+(i+1)+') '+sel,cls), .5,.04,t);
      }
      features.fromTo($('.list-item_line',button),{width:'0%'},{width:'100%',duration:.6,ease:'power2.out'},t);
    });
    const wipes = ergo.map((el, i) => {
      const tl = gsap.timeline({paused:true});
      const prefix = '.mask-scroll_screen.is-' + (i+1) + ' ';
      reveal(tl,lines(prefix+'.scroll-mask_title','scrollMaskTitle'),1.05,.12,0);
      reveal(tl,lines(prefix+'.scroll-mask_sub','scrollMaskSub'),.75,.09,'-=0.45');
      return tl;
    });
    revealErgo = i => wipes[i].play();
    const activeErgo = ergo.findLastIndex(el=>!el.classList.contains('is-next'));
    if (scrollY + innerHeight > sectionTop($('#ergonomics'))) revealErgo(Math.max(0,activeErgo));

    const print = gsap.timeline({scrollTrigger:{trigger:'#Print', start:'top top',end:'+=200%',scrub:true}});
    reveal(print,lines('.big-print_title','bigPrintTitle'),1,.1);
    reveal(print,lines('.big-print_size-text:first-child','bigPrintSizeText'),1,.1,'+=0.05');
    reveal(print,lines('.big-print_size-num','bigPrintSizeNum'),1,.1,'<0.3');
    reveal(print,lines('.big-print_size-text:last-child','bigPrintSizeText'),1,.1,'<0.3');
    reveal(print,lines('.big-print_sub','bigPrintSub'),1,.1);
    if (innerWidth <= 991) print.fromTo('.big-print_img-wrap',{opacity:0,yPercent:30},{opacity:1,yPercent:0,duration:1.6,ease:'power3.out'});
    scrub('.big-print_img',{scale:1.2},{scale:1},'#Print','top bottom','top top');
    reveal(entry('#Choose'),lines('.choose_title','chooseTitle'),.7,.08,0);
    for (const [sel,nextSection,start] of [
      ['.about_content','#Characteristics','top bottom'],['.feature-scroll_pin','#ergonomics'],['.mask-scroll_pin','#Print'],
      ['.big-print_pin','#Choose'],['.presets_pin','#mobile-app'],['.control_pin','#footer']]) {
      scrub(sel,{opacity:1},{opacity:0},nextSection,start || 'top 70%','top top');
    }
    scrub('.footer_bg',{scale:1.2},{scale:1},'#footer','top bottom','top 10%');
    const foot=entry('#footer','top 10%');
    function fade(target,y,duration,stagger=0,pos) {
      foot.fromTo(target,{opacity:0,yPercent:y},{opacity:1,yPercent:0,duration,stagger,ease:'power2.out'},pos);
    }
    const footerTitle = $('.footer_title');
    foot.fromTo(footerTitle, {opacity: 0, yPercent: 20}, {
      opacity: 1, yPercent: 0, duration: .6, ease: 'power2.out',
      onComplete: () => footerTitle.classList.add('is-visible'),
      onReverseComplete: () => footerTitle.classList.remove('is-visible'),
    });
    fade('.footer_content-top-col-3',10,.5);fade('.footer_content-box',30,.5,.1,'<');
    fade('.footer_content-top-col-2',10,.5);fade('.footer_content-top-col-2 .logo',30,.5,0,'<');
    fade('.footer_content-top-col-1',10,.5);fade('.footer_nav-link',30,.5,.1,'<');

    phoneWords = ['.control_title','.control_sub'].flatMap((sel,index) => {
      const el=$(sel); const split=SplitText.create(el,{type:'words',mask:'words',aria:index ? 'none' : 'auto'});splits.push(split);
      const shift=index ? (innerWidth<=991 ? -.08 : .12) : (innerWidth<=767 ? -.28 : -.18);
      let previous, row=-1;
      for(const word of split.words) {
        const mask=word.parentNode, top=Math.round(mask.getBoundingClientRect().top);
        if(previous===undefined || top>previous+2){previous=top;row++;}
        if(row) mask.style.transform='translateY('+row*shift+'em)';
      }
      el.style.marginBottom=Math.max(0,row)*shift+'em';
      return split.words;
    });
    return () => {
      document.removeEventListener('snapa:preloaderDone',playHero);
      revealErgo=()=>{};
      phoneWords=[];
      for(const el of all('.control_title,.control_sub')) el.style.marginBottom='';
      splits.reverse().forEach(split=>split.revert());
    };
  }

  let sceneContext;
  function rebuildScenes() {
    sceneContext?.revert();
    sceneContext = gsap.context(() => {
      if (!reduced.matches) return scenes();
      entrancePlayed=true;
      gsap.set('.footer_bg',{scale:1});
      gsap.set('.control_title-item',{opacity:1});
    });
    ScrollTrigger.refresh();
    morph();
  }
  for(const selector of ['#Characteristics','#mobile-app']) {
    ScrollTrigger.create({trigger:selector,start:'top top',toggleClass:{targets:selector,className:'is-active'}});
  }

  // The native dialog owns focus and validation. Submission stays on this page.
  const dialog=$('#order'), form=dialog.querySelector('form'), status=$('.order-status',dialog);
  gsap.set(dialog, {yPercent: -100, scaleY: 0});
  const total=$('#total',dialog), success=$('.form_success',dialog);
  const formatter=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
  let opener, closing=false;
  const heroOrder = $('.hero_navbar [data-order]');
  function animateOrderPress(event) {
    const pressed = event.type === 'pointerdown';
    gsap.to(heroOrder, {
      scale: pressed && !reduced.matches ? .9 : 1,
      duration: reduced.matches ? 0 : pressed ? .15 : .2,
      ease: 'power2.out',
      overwrite: 'auto',
    });
  }
  for (const type of ['pointerdown', 'pointerup', 'pointerleave', 'pointercancel']) {
    heroOrder.addEventListener(type, animateOrderPress);
  }
  function updatePrice() {
    total.value=formatter.format(all('input[data-price]:checked',form).reduce((sum,input)=>sum+Number(input.dataset.price),0));
  }
  function closeOrder() {
    if (closing) return;
    closing=true;
    gsap.to(dialog,{yPercent:-100,scaleY:0,duration:reduced.matches?0:.5,ease:'power2.in',overwrite:true,onComplete:()=>dialog.close()});
  }
  for (const button of all('[data-order]')) button.addEventListener('click',()=>{
    if(dialog.open)return;
    opener=button;
    lenis.stop();
    dialog.showModal();
    $('.order_content-wrap',dialog).scrollTop=0;
    gsap.to(dialog,{yPercent:0,scaleY:1,duration:reduced.matches?0:1,ease:'power2.out',overwrite:true});
  });
  for (const btn of all('.close-order,.form_success button',dialog)) btn.addEventListener('click',closeOrder);
  dialog.addEventListener('cancel',e=>{e.preventDefault();closeOrder();});
  dialog.addEventListener('close',()=>{
    closing=false;
    gsap.set(dialog, {yPercent: -100, scaleY: 0, overwrite: true});
    if(!success.hidden) { form.reset();form.hidden=false;success.hidden=true;updatePrice(); }
    lenis.start();
    opener?.focus({preventScroll:true});
  });
  form.addEventListener('input',updatePrice);
  for (const input of all('.form_field input',form)) {
    const validate=()=>input.closest('label').classList.toggle('is-error',!input.value.trim());
    input.addEventListener('blur',validate);input.addEventListener('invalid',validate);
    input.addEventListener('input',validate);
  }
  form.addEventListener('submit',event=>{
    event.preventDefault();
    status.textContent='Your '+form.elements.camera.value+' order for '+total.value+' is ready. This is a demo and the order was not sent.';
    success.hidden=false;form.hidden=true;success.querySelector('button').focus();
  });
  updatePrice();

  document.fonts.ready.then(()=>{
    rebuildScenes();
    // The local #presets bookmark opens the finished print.
    if (location.hash === '#presets') {
      setPreset(photos.length - 1);
      lenis.scrollTo(shrinkMarker.getBoundingClientRect().top + scrollY + 1, {immediate: true});
      morph();
    }
    observe('.control_marker',i=>{if(performance.now()>=phoneLock)showPhone(i);});
    runIntro();
    let width=innerWidth, resizeTimer;
    window.addEventListener('resize',()=>{
      if (width===innerWidth) return;
      width=innerWidth;
      clearTimeout(resizeTimer);
      resizeTimer=setTimeout(rebuildScenes,120);
    });
    reduced.addEventListener('change',()=>{lenis.options.smoothWheel=!reduced.matches;rebuildScenes();});
  });
})();
