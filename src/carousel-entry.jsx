import React from "react";
import { createRoot } from "react-dom/client";
import CircularCarousel from "./circular-carousel/CircularCarousel.jsx";
import "./carousel-portfolio.css";

function CarouselPanel({ module }) {
  const items = module.works || [];

  return (
    <div className="portfolio-carousel-frame">
      <div className="portfolio-carousel-heading" aria-hidden="true">
        <span>{module.title}</span>
        <span>{String(items.length).padStart(2, "0")} WORKS</span>
      </div>
      <CircularCarousel
        items={items}
        preset="cylinder"
        intro="rise"
        cardWidth={300}
        aspectRatio={1.18}
        gap={30}
        speed={9}
        interval={4}
        direction="left"
        draggable
        momentum={0.72}
        snap
        pauseOnHover
        focusOnClick
        parallax={0.22}
        stretch={0.36}
        depthFade={0.72}
        fadeColor="#0d0907"
        innerShade={0.74}
        cornerRadius={8}
        captions
        carouselLabel={`${module.title}作品轮播`}
        onItemClick={(item) => window.PortfolioApp?.openWork(item.id)}
      />
    </div>
  );
}

const roots = new Map();
let scheduleTimer = 0;

function unmountAll() {
  roots.forEach((root) => root.unmount());
  roots.clear();
}

function mountCarousels() {
  window.clearTimeout(scheduleTimer);
  const data = window.PortfolioApp?.getCarouselData?.() || { modules: [] };
  const slots = Array.from(document.querySelectorAll("[data-carousel-module]"));

  if (!slots.length) {
    unmountAll();
    return;
  }

  const currentSlots = new Set(slots);
  roots.forEach((root, slot) => {
    if (!currentSlots.has(slot)) {
      root.unmount();
      roots.delete(slot);
    }
  });

  slots.forEach((slot) => {
    const moduleId = slot.dataset.carouselModule;
    const module = data.modules.find((item) => item.id === moduleId);
    if (!module || !module.works.length) return;
    let root = roots.get(slot);
    if (!root) {
      root = createRoot(slot);
      roots.set(slot, root);
    }
    root.render(<CarouselPanel module={module} />);
  });
}

function scheduleMount(delay = 0) {
  window.clearTimeout(scheduleTimer);
  scheduleTimer = window.setTimeout(mountCarousels, delay);
}

window.addEventListener("portfolio:workspace-rendered", () => scheduleMount());
window.addEventListener("DOMContentLoaded", () => scheduleMount(40));

const workspace = document.getElementById("workspace");
if (workspace) {
  new MutationObserver(() => scheduleMount(20)).observe(workspace, { childList: true });
}

scheduleMount(60);
