import { useEffect, useRef } from 'react';

export default function HeroBlob({theme}: {theme: 'dark' | 'light'}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resolvedTheme = theme;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Прозрачность привяжем к скроллу
    const handleScroll = () => {
      if (canvas) {
        const scrollY = window.scrollY;
        const isMobile = window.innerWidth < 768;
        const fadeOutDist = isMobile ? 600 : 2500;
        const opacity = Math.max(0, 1 - scrollY / fadeOutDist);
        canvas.style.opacity = opacity.toString();
      }
    };
    window.addEventListener('scroll', handleScroll);
    handleScroll(); // init

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Поддержка Retina дисплеев
    const dpr = window.devicePixelRatio || 1;
    let logicalWidth = canvas.offsetWidth;
    let logicalHeight = canvas.offsetHeight;
    
    canvas.width = logicalWidth * dpr;
    canvas.height = logicalHeight * dpr;
    ctx.scale(dpr, dpr);

    // Центр при загрузке — середина экрана
    let targetX = logicalWidth / 2;
    let targetY = logicalHeight / 2;
    let currentX = targetX;
    let currentY = targetY;

    class Particle {
      angle: number;
      normalizedR: number; // От 0 (центр) до 1 (край "шарика")

      constructor(angle: number, r: number) {
        this.angle = angle;
        this.normalizedR = r;
      }
    }

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    // Чуть больше точек для мобильной версии, чтобы сохранить плотность при увеличении
    const baseParticles = isMobile ? 550 : 440;
    // Дополнительные частицы, которые будут находиться исключительно на краях
    const edgeParticles = Math.floor(baseParticles * 0.35); 
    
    const particles: Particle[] = [];
    
    // Равномерное распределение частиц по спирали Фибоначчи с добавлением небольшого шума (jitter)
    const goldenRatio = (1 + Math.sqrt(5)) / 2;
    const angleIncrement = Math.PI * 2 * goldenRatio;

    for (let i = 0; i < baseParticles; i++) {
        const t = i / (baseParticles - 1 || 1);
        // Избегаем абсолютного нуля, чтобы не слипались в центре
        const rNormBase = 0.06 + Math.sqrt(t) * 0.94; 
        
        // Небольшой шум (jitter), чтобы скрыть идеальную математическую спираль. На мобильных (где масштаб x4) делаем шум меньше
        const jitterR = (Math.random() - 0.5) * (isMobile ? 0.01 : 0.05);
        const jitterTheta = (Math.random() - 0.5) * (isMobile ? 0.05 : 0.2);

        let rNorm = rNormBase + jitterR;
        if (rNorm < 0.05) rNorm = 0.05; // Не даем провалиться в точный ноль
        if (rNorm > 1) rNorm = 1;

        const theta = i * angleIncrement + jitterTheta;
        particles.push(new Particle(theta, rNorm));
    }

    // Добавляем дополнительные частицы строго по самым краям
    for (let i = 0; i < edgeParticles; i++) {
        const theta = i * angleIncrement;
        // Распределяем их близко к 1.0 (и даже немного дальше, до 1.05)
        const rNormBase = 0.95 + Math.random() * 0.1;
        particles.push(new Particle(theta, rNormBase));
    }

    const handleResize = () => {
      logicalWidth = canvas.offsetWidth;
      logicalHeight = canvas.offsetHeight;
      canvas.width = logicalWidth * dpr;
      canvas.height = logicalHeight * dpr;
      ctx.scale(dpr, dpr);
      targetX = logicalWidth / 2;
      targetY = logicalHeight / 2;
    };
    window.addEventListener('resize', handleResize);

    // Цель для центра летит за курсором
    const handleMouseMove = (e: MouseEvent) => {
      const isMobile = window.innerWidth < 768;
      if (isMobile) return; // Не реагируем на курсор на мобильных
      const rect = canvas.getBoundingClientRect();
      
      // Вычисляем координаты мыши относительно канваса
      let localX = e.clientX - rect.left;
      let localY = e.clientY - rect.top;

      // Ограничиваем влияние курсора рамками канваса, чтобы фигура
      // не уходила за нижнюю или боковые границы, а просто упиралась в них.
      if (localX < 0) localX = 0;
      if (localX > logicalWidth) localX = logicalWidth;
      if (localY < 0) localY = 0;
      if (localY > logicalHeight) localY = logicalHeight;

      targetX = localX;
      targetY = localY;
    };
    window.addEventListener('mousemove', handleMouseMove);
    
    // Возврат в центр при уводе мыши за пределы окна браузера
    const handleMouseLeave = () => {
        targetX = logicalWidth / 2;
        targetY = logicalHeight / 2;
    };
    window.addEventListener('mouseleave', handleMouseLeave);

    let animationFrameId: number;
    let time = 0;

    const render = () => {
      time += 0.012; // Плавное течение времени
      ctx.clearRect(0, 0, logicalWidth, logicalHeight);

      // Инерция: весь объект плавно следует за курсором (уменьшенная скорость)
      currentX += (targetX - currentX) * 0.03;
      currentY += (targetY - currentY) * 0.03;

      const isMobile = window.innerWidth < 768;
      // Размер фигуры
      let maxRadius = Math.min(logicalWidth, logicalHeight) * 0.567;
      if (isMobile) {
        // Делаем чуть больше на мобильных, но не на весь экран
        maxRadius *= 1.4;
      }
      const innerRadius = maxRadius * 0.6; // Граница "малого круга" для расчёта размеров
      // Вектор от центра фигуры к курсору для эффекта натяжения за мышью
      let pullDx = 0, pullDy = 0, pullDist = 0, pullAngle = 0, stretchPullAmount = 0;
      if (!isMobile) {
        pullDx = targetX - currentX;
        pullDy = targetY - currentY;
        pullDist = Math.sqrt(pullDx * pullDx + pullDy * pullDy);
        pullAngle = Math.atan2(pullDy, pullDx);
        stretchPullAmount = Math.min(1.0, pullDist / (maxRadius * 1.5)) * 0.7; // Сила растяжения за курсором
      } else {
        // На мобильных перетекает: симулируем плавный вектор "тяги"
        pullDx = Math.sin(time * 0.6) * maxRadius * 0.5;
        pullDy = Math.cos(time * 0.4) * maxRadius * 0.5;
        pullDist = Math.sqrt(pullDx * pullDx + pullDy * pullDy);
        pullAngle = Math.atan2(pullDy, pullDx);
        stretchPullAmount = 0.3 + Math.sin(time * 0.5) * 0.15; // Мягкая пульсация растяжения
      }

      // Вспомогательная функция для случайной "пульсации" краев (стоячие волны, а не круговое вращение)
      const getDeformation = (angle: number, baseT: number) => {
        const t = baseT * 1.2; // Увеличиваем скорость деформации на 20%
        // Стоячие волны меняют амплитуду (cos/sin(t)), но не вращаются активно,
        // что убирает "скручивание" и делает движение случайным пульсирующим.
        const pulse2 = Math.sin(angle * 2 + Math.sin(t * 0.3)) * Math.cos(t * 0.5); 
        const pulse3 = Math.cos(angle * 3 + Math.cos(t * 0.2)) * Math.sin(t * 0.65); 
        const pulse1 = Math.sin(angle * 1 + Math.sin(t * 0.4)) * Math.sin(t * 0.45);
        
        let val = pulse2 * 0.5 + pulse3 * 0.35 + pulse1 * 0.2;
        // Мягкая степень (1.2) сглаживает коллизии и рывки между соседними диапазонами
        return Math.sign(val) * Math.pow(Math.abs(val), 1.2);
      };

      // Диапазон растяжения/сжатия - 35%
      const stretchRange = maxRadius * 0.35;

      // Анализируем общее натяжение краев для вычисления сдвига всего "желе"
      let shiftX = 0;
      let shiftY = 0;
      const numSamples = 16;
      for (let i = 0; i < numSamples; i++) {
        const a = (i / numSamples) * Math.PI * 2;
        let d = getDeformation(a, time);
        
        // Влияние мыши: вытягиваем только сторону, смотрящую на мышь (Math.max(0, ...))
        const angleDiff = a - pullAngle;
        const mouseDeform = Math.max(0, Math.cos(angleDiff)) * stretchPullAmount;
        d += mouseDeform;

        shiftX += Math.cos(a) * d;
        shiftY += Math.sin(a) * d;
      }
      // Центр смещается в сторону растянутых краев
      const globalShiftX = (shiftX / numSamples) * stretchRange * 1.6;
      const globalShiftY = (shiftY / numSamples) * stretchRange * 1.6;

      particles.forEach(p => {
        // --- МОДЕЛЬ ЕДИНОГО УПРУГОГО ВЕЩЕСТВА ---
        
        let deformation = getDeformation(p.angle, time);
        
        // Добавка растяжения от мыши (в сторону курсора)
        let angleDiff = p.angle - pullAngle;
        const mouseDeform = Math.max(0, Math.cos(angleDiff)) * stretchPullAmount;
        deformation += mouseDeform;

        // Изначально частицы распределены равномерно по всему maxRadius
        // При деформации граница вытягивается или сжимается в рамках уменьшенного диапазона
        const boundaryR = maxRadius + deformation * stretchRange;

        // Положение частицы от геометрического центра (до сдвига самого ядра)
        let pLocalX = Math.cos(p.angle) * (p.normalizedR * boundaryR);
        let pLocalY = Math.sin(p.angle) * (p.normalizedR * boundaryR);

        // Применяем влияние краев на центр:
        // Если края тянутся, они тянут за собой центр. Если сжимаются - толкают к противоположному краю.
        // Ядро (normalizedR близко к 0) смещается максимально, край (normalizedR = 1) смещается минимально, оставаясь на границе.
        const coreWeight = 1 - Math.pow(p.normalizedR, 1.2);
        pLocalX += globalShiftX * coreWeight;
        pLocalY += globalShiftY * coreWeight;

        // Текущее физическое расстояние от геометрического центра (используется для размера частиц)
        const currentR = Math.sqrt(pLocalX * pLocalX + pLocalY * pLocalY);

        // Пик (самые большие частицы) находится перед самым краем границы (80%)
        const peakRadius = boundaryR * 0.8;

        // --- ДИНАМИЧЕСКИЙ РАЗМЕР ЧАСТИЦ (строгая композиция) ---
        // Использование ИЗНАЧАЛЬНОЙ позиции частицы (normalizedR), 
        // чтобы ее размер был стабильным и не нарушался при вытягивании краев фигуры.
        let sizeMultiplier = 0.15;
        const nR = p.normalizedR;
        
        const innerAreaNorm = 0.55; // 55% фигуры - маленькие центральные
        const peakNorm = 0.85; // 85% фигуры - самые большие

        if (nR <= innerAreaNorm) {
            // В центре (до 55%) частицы маленькие (от 0.15 до 0.25)
            sizeMultiplier = 0.15 + Math.pow(nR / innerAreaNorm, 2) * 0.1; 
        } else if (nR <= peakNorm) {
            // От центра к пику (85%) они растут (от 0.25 до 1.0)
            const progress = (nR - innerAreaNorm) / (peakNorm - innerAreaNorm); 
            sizeMultiplier = 0.25 + progress * 0.75; 
        } else if (nR <= 1.0) {
            // От пика к 100% рубежу они снова убывают (до 0.15)
            const progress = (nR - peakNorm) / (1.0 - peakNorm);
            sizeMultiplier = 1.0 - progress * 0.85;
        } else {
            // Внешние дополнительные частицы - всегда остаются маленькие
            sizeMultiplier = 0.15;
        }

        // Плавный экспоненциальный рост размера для эстетики
        sizeMultiplier = Math.pow(sizeMultiplier, 1.5);
        sizeMultiplier = Math.max(0.15, sizeMultiplier); // Базовая защита

        // Размеры штрихов 
        let length = 2.5 + sizeMultiplier * 6;
        // Уменьшена максимальная ширина (толщина)
        let thickness = 2 + sizeMultiplier * 8; 

        let alpha;
        if (window.innerWidth < 768) {
          length = 1.5; 
          thickness = 1.5;
          alpha = 1.0; // Без прозрачности 
        } else {
          // Прозрачность: в центре более плотные, на самых дальних краях чуть-чуть светлеют
          alpha = 0.85 - sizeMultiplier * 0.3;
          if (resolvedTheme === 'dark') {
            alpha = 0.95 - sizeMultiplier * 0.2; // В темной теме ярче
          }
        }
        
        // Итоговые координаты на экране
        const px = currentX + pLocalX;
        const py = currentY + pLocalY;

        // Направление штриха: всегда от визуального центра (радиально)
        const finalAngle = Math.atan2(pLocalY, pLocalX);

        // Рисуем частицу
        ctx.save();
        ctx.translate(px, py);
        
        ctx.beginPath();
        // Используем честные круги (arc), чтобы края были идеально круглыми
        let radius = thickness / 2;
        if (window.innerWidth < 768) {
          radius = 1.0; // Явно заданный четкий радиус для мобильных
        } else {
          radius = 1.0 + sizeMultiplier * 1.5; // Маленькие округлые частицы для десктопа
        }
        
        // Рисуем вытянутую пилюлю, если length > толщины, иначе круг
        if (length > thickness * 1.2 && window.innerWidth >= 768) {
           ctx.rotate(finalAngle); // Вращаем только вытянутые пилюли
           ctx.moveTo(-length / 2, 0);
           ctx.lineTo(length / 2, 0);
           ctx.lineWidth = radius * 2;
           ctx.lineCap = 'round';
        } else {
           // Для мелких круглых частиц вращение не нужно
           ctx.arc(0, 0, radius, 0, Math.PI * 2);
        }

        // "Капли краски": интерференция синусоид от координат 
        const paintScale = 0.003; 
        const paintTime = time * 0.4;
        
        const v1 = Math.sin(pLocalX * paintScale + paintTime);
        const v2 = Math.cos(pLocalY * paintScale - paintTime * 0.8);
        const v3 = Math.sin((pLocalX - pLocalY) * paintScale * 0.8 + paintTime * 1.2);
        
        const sum = v1 + v2 + v3;
        const wave = Math.sin(sum); 
        const bounceT = (wave + 1) / 2;

        let hue;
        // Приоритеты: 50% Синий, 30% Фиолетовый, 13% Красный, 7% Желтый
        if (bounceT < 0.5) {
            hue = 220 + (bounceT / 0.5) * 35; // Синий спектр: 220 - 255
        } else if (bounceT < 0.8) {
            hue = 255 + ((bounceT - 0.5) / 0.3) * 55; // Фиолетовый спектр: 255 - 310
        } else if (bounceT < 0.93) {
            hue = 310 + ((bounceT - 0.8) / 0.13) * 50; // Красный спектр: 310 - 360
        } else {
            hue = 360 + ((bounceT - 0.93) / 0.07) * 40; // Желтый спектр: 360 - 400 (40)
        }
        hue = hue % 360;
        
        // Насыщенность и яркость зависят от темы
        const saturation = resolvedTheme === 'dark' ? 85 : 85; 
        const lightness = resolvedTheme === 'dark' ? 60 : 50; 
        const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        
        if (length > thickness * 1.2 && window.innerWidth >= 768) {
           ctx.stroke();
        } else {
           ctx.fill();
        }
        ctx.restore();
      });

      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) animationFrameId = requestAnimationFrame(render);
    };
    render();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, [resolvedTheme]);

  return (
    <canvas 
      ref={canvasRef} 
      aria-hidden="true"
      data-landing-animation="particles"
      className="absolute inset-0 w-full h-full pointer-events-none z-0" 
      style={{ contain: 'strict' }}
    />
  );
}
