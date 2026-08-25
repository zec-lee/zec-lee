// Reversible scroll motion for the Selected Work heading and projects.
const flowItems = document.querySelectorAll("[data-scroll-flow]");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

if (flowItems.length && !reduceMotion.matches) {
  document.documentElement.classList.add("motion-ready");

  let frameRequested = false;

  const clamp = (value, minimum, maximum) =>
    Math.min(Math.max(value, minimum), maximum);

  const updateFlow = () => {
    const viewportHeight = window.innerHeight;
    const motionRange = window.innerWidth <= 760 ? 8 : 16;

    flowItems.forEach((item) => {
      const bounds = item.getBoundingClientRect();
      const progress = clamp(
        (viewportHeight - bounds.top) / (viewportHeight + bounds.height),
        0,
        1
      );
      const direction = Number(item.dataset.flowDirection) || 1;
      const offset = (0.5 - progress) * motionRange * direction;

      // Fade at the viewport edges and remain fully present through the centre.
      const fadeIn = progress / 0.16;
      const fadeOut = (1 - progress) / 0.16;
      const opacity = clamp(Math.min(fadeIn, fadeOut), 0, 1);

      item.style.setProperty("--flow-x", `${offset}vw`);
      item.style.setProperty("--flow-opacity", opacity.toFixed(3));
    });

    frameRequested = false;
  };

  const requestFlowUpdate = () => {
    if (!frameRequested) {
      window.requestAnimationFrame(updateFlow);
      frameRequested = true;
    }
  };

  window.addEventListener("scroll", requestFlowUpdate, { passive: true });
  window.addEventListener("resize", requestFlowUpdate);
  window.addEventListener("pageshow", requestFlowUpdate);
  updateFlow();
}

// A softly trailing cursor ring appears only for mouse/trackpad users.
const cursorFollower = document.querySelector(".cursor-follower");
const finePointer = window.matchMedia("(pointer: fine)");

if (cursorFollower && finePointer.matches && !reduceMotion.matches) {
  let pointerX = -80;
  let pointerY = -80;
  let followerX = -80;
  let followerY = -80;
  let cursorFrame = null;

  const drawCursor = () => {
    followerX += (pointerX - followerX) * 0.18;
    followerY += (pointerY - followerY) * 0.18;
    cursorFollower.style.transform =
      `translate3d(${followerX}px, ${followerY}px, 0) translate(-50%, -50%)`;

    const distance = Math.abs(pointerX - followerX) + Math.abs(pointerY - followerY);
    cursorFrame = distance > 0.1 ? window.requestAnimationFrame(drawCursor) : null;
  };

  const requestCursorDraw = () => {
    if (!cursorFrame) cursorFrame = window.requestAnimationFrame(drawCursor);
  };

  window.addEventListener("pointermove", (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;

    if (document.body.classList.contains("cfd-pointer-mode")) {
      cursorFollower.classList.remove("is-visible");
      return;
    }

    cursorFollower.classList.add("is-visible");
    requestCursorDraw();
  }, { passive: true });

  document.documentElement.addEventListener("pointerleave", () => {
    cursorFollower.classList.remove("is-visible");
  });

  document.querySelectorAll("a, button, video, .cursor-target").forEach((target) => {
    target.addEventListener("pointerenter", () => {
      cursorFollower.classList.add("is-active");
    });
    target.addEventListener("pointerleave", () => {
      cursorFollower.classList.remove("is-active");
    });
  });
}

// The landing-page pointer becomes a small CFD field made from streamlines.
const cfdCanvas = document.querySelector(".cfd-cursor-field");
const hero = document.querySelector(".hero");

if (cfdCanvas && hero && finePointer.matches && !reduceMotion.matches) {
  const context = cfdCanvas.getContext("2d");
  const trail = [];
  const lineOffsets = Array.from({ length: 20 }, (_, index) =>
    (index - 9.5) * 4.5
  );
  // ParaView's ERDC Rainbow Bright transfer-function control points.
  const erdcRainbowBright = [
    [0, [83, 38, 245]],
    [0.0669, [76, 96, 246]],
    [0.1338, [46, 137, 246]],
    [0.2007, [33, 166, 237]],
    [0.2676, [11, 191, 218]],
    [0.3344, [7, 212, 184]],
    [0.4013, [66, 221, 139]],
    [0.4682, [109, 227, 84]],
    [0.5351, [145, 229, 48]],
    [0.602, [188, 227, 21]],
    [0.6689, [216, 220, 4]],
    [0.7358, [233, 206, 0]],
    [0.8027, [246, 181, 0]],
    [0.8696, [255, 153, 4]],
    [0.9365, [253, 114, 49]],
    [1, [250, 63, 67]]
  ];
  let canvasWidth = window.innerWidth;
  let canvasHeight = window.innerHeight;
  let targetX = canvasWidth * 0.5;
  let targetY = canvasHeight * 0.5;
  let headX = targetX;
  let headY = targetY;
  let flowAngle = 0;
  let fieldActive = true;
  let fieldFrame = null;

  const resizeField = () => {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvasWidth = window.innerWidth;
    canvasHeight = window.innerHeight;
    cfdCanvas.width = Math.round(canvasWidth * pixelRatio);
    cfdCanvas.height = Math.round(canvasHeight * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  };

  const erdcColourAt = (position, alpha = 1) => {
    const value = Math.min(1, Math.max(0, position));
    const upperIndex = erdcRainbowBright.findIndex(([stop]) => stop >= value);
    const safeUpperIndex = upperIndex === -1
      ? erdcRainbowBright.length - 1
      : upperIndex;
    const lowerIndex = Math.max(0, safeUpperIndex - 1);
    const [lowerStop, lowerColour] = erdcRainbowBright[lowerIndex];
    const [upperStop, upperColour] = erdcRainbowBright[safeUpperIndex];
    const range = upperStop - lowerStop;
    const mix = range === 0 ? 0 : (value - lowerStop) / range;
    const colour = lowerColour.map((channel, index) =>
      Math.round(channel + (upperColour[index] - channel) * mix)
    );

    return `rgba(${colour[0]}, ${colour[1]}, ${colour[2]}, ${alpha})`;
  };

  const drawGlyph = (point, newerPoint, colour) => {
    const angle = Math.atan2(
      newerPoint.y - point.y,
      newerPoint.x - point.x
    );

    context.save();
    context.translate(point.x, point.y);
    context.rotate(angle);
    context.beginPath();
    context.moveTo(-4, -3);
    context.lineTo(0, 0);
    context.lineTo(-4, 3);
    context.strokeStyle = colour;
    context.lineWidth = 1.25;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.stroke();
    context.restore();
  };

  const buildStreamline = (offset, lineIndex, time) => {
    const directionX = Math.cos(flowAngle);
    const directionY = Math.sin(flowAngle);
    const head = trail[0];

    // Keep a short upstream field visible when the pointer pauses.
    const basePoints = trail.map((point, index) => {
      const distanceFromHead = Math.hypot(point.x - head.x, point.y - head.y);
      const minimumWakeLength = index * 2.15;
      const extension = Math.max(0, minimumWakeLength - distanceFromHead);

      return {
        x: point.x - directionX * extension,
        y: point.y - directionY * extension
      };
    });

    return basePoints.map((point, index) => {
      const newer = basePoints[Math.max(0, index - 1)];
      const older = basePoints[Math.min(basePoints.length - 1, index + 1)];
      let tangentX = newer.x - older.x;
      let tangentY = newer.y - older.y;
      const tangentLength = Math.hypot(tangentX, tangentY) || 1;
      tangentX /= tangentLength;
      tangentY /= tangentLength;

      const normalX = -tangentY;
      const normalY = tangentX;
      const separationSide = offset < 0 ? -1 : 1;
      const centreBias = 1 - Math.min(1, Math.abs(offset) / 48);
      const obstacleSeparation =
        separationSide * 16 * centreBias * Math.exp(-index / 7.5);
      const wakeEnvelope =
        (1 - Math.exp(-index / 8)) * Math.exp(-index / 48);
      const vortexWake =
        Math.sin(index * 0.28 - time * 0.004 + lineIndex * 0.5) *
        4.5 * centreBias * wakeEnvelope;
      const normalOffset = offset + obstacleSeparation + vortexWake;

      return {
        x: point.x + normalX * normalOffset,
        y: point.y + normalY * normalOffset
      };
    });
  };

  const traceSmoothLine = (points) => {
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);

    for (let index = 1; index < points.length - 1; index += 1) {
      const midpointX = (points[index].x + points[index + 1].x) * 0.5;
      const midpointY = (points[index].y + points[index + 1].y) * 0.5;
      context.quadraticCurveTo(
        points[index].x,
        points[index].y,
        midpointX,
        midpointY
      );
    }

    const finalPoint = points[points.length - 1];
    context.lineTo(finalPoint.x, finalPoint.y);
  };

  const drawField = (time) => {
    if (!fieldActive) {
      fieldFrame = null;
      return;
    }

    headX += (targetX - headX) * 0.16;
    headY += (targetY - headY) * 0.16;
    trail.unshift({ x: headX, y: headY });
    if (trail.length > 82) trail.pop();

    context.clearRect(0, 0, canvasWidth, canvasHeight);
    context.lineCap = "round";
    context.lineJoin = "round";

    lineOffsets.forEach((offset, lineIndex) => {
      if (trail.length < 3) return;

      const points = buildStreamline(offset, lineIndex, time);
      const tail = points[points.length - 1];
      const head = points[0];
      const gradient = context.createLinearGradient(tail.x, tail.y, head.x, head.y);
      erdcRainbowBright.forEach(([stop]) => {
        const opacity = 0.18 + stop * 0.82;
        gradient.addColorStop(stop, erdcColourAt(stop, opacity));
      });

      traceSmoothLine(points);
      context.strokeStyle = gradient;
      context.lineWidth = 1.15 +
        (1 - Math.min(1, Math.abs(offset) / 48)) * 1.35;
      context.stroke();

      if (lineIndex % 2 === 0) {
        [14, 30, 48, 66].forEach((index) => {
          if (points[index]) {
            const newerPoint = points[Math.max(0, index - 2)];
            const scalarPosition = 1 - index / (points.length - 1);
            const opacity = 0.86 - index / 170;
            drawGlyph(
              points[index],
              newerPoint,
              erdcColourAt(scalarPosition, opacity)
            );
          }
        });
      }
    });

    // A small virtual probe creates the visible streamline separation point.
    context.beginPath();
    context.arc(headX, headY, 6.5, 0, Math.PI * 2);
    context.fillStyle = erdcColourAt(1, 0.28);
    context.fill();
    context.strokeStyle = erdcColourAt(1, 0.96);
    context.lineWidth = 1.2;
    context.stroke();

    fieldFrame = window.requestAnimationFrame(drawField);
  };

  const startField = () => {
    if (!fieldFrame) fieldFrame = window.requestAnimationFrame(drawField);
  };

  const updatePointerMode = () => {
    const heroBounds = hero.getBoundingClientRect();
    const shouldShowField = heroBounds.bottom > window.innerHeight * 0.52;

    fieldActive = shouldShowField;
    document.body.classList.toggle("cfd-pointer-mode", shouldShowField);
    cfdCanvas.classList.toggle("is-hidden", !shouldShowField);

    if (shouldShowField) {
      cursorFollower?.classList.remove("is-visible");
      startField();
    } else {
      cursorFollower?.classList.add("is-visible");
    }
  };

  window.addEventListener("pointermove", (event) => {
    const movementX = event.clientX - targetX;
    const movementY = event.clientY - targetY;
    if (Math.hypot(movementX, movementY) > 1.5) {
      flowAngle = Math.atan2(movementY, movementX);
    }
    targetX = event.clientX;
    targetY = event.clientY;
  }, { passive: true });

  window.addEventListener("scroll", updatePointerMode, { passive: true });
  window.addEventListener("resize", () => {
    resizeField();
    updatePointerMode();
  });

  resizeField();
  updatePointerMode();
}

// Each project gallery can be swiped, scrolled, or moved with its arrow controls.
document.querySelectorAll("[data-carousel]").forEach((carousel) => {
  const track = carousel.querySelector(".carousel-track");
  const slides = Array.from(carousel.querySelectorAll(".carousel-slide"));
  const controls = carousel.querySelector(".carousel-controls");
  const previousButton = carousel.querySelector("[data-carousel-prev]");
  const nextButton = carousel.querySelector("[data-carousel-next]");
  const status = carousel.querySelector(".carousel-status");
  let currentIndex = 0;
  let carouselFrame = null;

  if (!track || !slides.length) return;

  const twoDigits = (number) => String(number).padStart(2, "0");

  const updateCarousel = () => {
    const slideWidth = track.clientWidth || 1;
    currentIndex = Math.min(
      slides.length - 1,
      Math.max(0, Math.round(track.scrollLeft / slideWidth))
    );

    if (status) {
      status.textContent = `${twoDigits(currentIndex + 1)} / ${twoDigits(slides.length)}`;
    }

    if (previousButton) previousButton.disabled = currentIndex === 0;
    if (nextButton) nextButton.disabled = currentIndex === slides.length - 1;

    // Stop audio or motion when a video leaves the visible slide.
    slides.forEach((slide, index) => {
      if (index !== currentIndex) slide.querySelector("video")?.pause();
    });

    carouselFrame = null;
  };

  const requestCarouselUpdate = () => {
    if (!carouselFrame) carouselFrame = window.requestAnimationFrame(updateCarousel);
  };

  const moveToSlide = (index) => {
    const targetIndex = Math.min(slides.length - 1, Math.max(0, index));
    track.scrollTo({
      left: targetIndex * track.clientWidth,
      behavior: reduceMotion.matches ? "auto" : "smooth"
    });
  };

  if (slides.length === 1 && controls) controls.hidden = true;

  previousButton?.addEventListener("click", () => moveToSlide(currentIndex - 1));
  nextButton?.addEventListener("click", () => moveToSlide(currentIndex + 1));
  track.addEventListener("scroll", requestCarouselUpdate, { passive: true });
  window.addEventListener("resize", requestCarouselUpdate);
  updateCarousel();
});

// Start selected project videos at their editorially chosen timestamp once.
document.querySelectorAll("video[data-start-time]").forEach((video) => {
  const applyStartTime = () => {
    if (video.dataset.startTimeApplied === "true") return;

    const startTime = Number(video.dataset.startTime);
    if (!Number.isFinite(startTime) || startTime < 0) return;

    video.currentTime = startTime;
    video.dataset.startTimeApplied = "true";
  };

  if (video.readyState >= 1) applyStartTime();
  else video.addEventListener("loadedmetadata", applyStartTime, { once: true });
});

