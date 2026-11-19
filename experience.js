(function () {
  "use strict";

  const body = document.body;
  const experience = document.getElementById("experience");
  const worldScreen = document.getElementById("worldScreen");
  const introScreen = document.getElementById("introScreen");
  const introVideo = document.getElementById("introVideo");
  const backToIntroButton = document.getElementById("experienceBackButton");
  const validStages = new Set(["world", "intro", "portfolio"]);
  let currentStage = validStages.has(body.dataset.stage) ? body.dataset.stage : "world";
  let portfolioFocusTimer = 0;

  function playVideo(video) {
    if (!video || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const playback = video.play();
    if (playback && typeof playback.catch === "function") playback.catch(() => {});
  }

  function pauseVideo(video) {
    if (video && !video.paused) video.pause();
  }

  function setStage(nextStage, options = {}) {
    if (!validStages.has(nextStage)) return;
    const previousStage = currentStage;
    currentStage = nextStage;
    body.dataset.stage = nextStage;

    const isPortfolio = nextStage === "portfolio";
    experience.setAttribute("aria-hidden", String(isPortfolio));
    worldScreen.setAttribute("aria-hidden", String(nextStage !== "world"));
    introScreen.setAttribute("aria-hidden", String(nextStage !== "intro"));

    document.querySelectorAll("[data-stage-link]").forEach((button) => {
      const target = button.dataset.stageLink;
      button.setAttribute("aria-current", target === nextStage ? "page" : "false");
    });

    window.clearTimeout(portfolioFocusTimer);

    if (nextStage === "intro") {
      playVideo(introVideo);
    } else if (nextStage === "world") {
      pauseVideo(introVideo);
    } else {
      pauseVideo(introVideo);
      window.scrollTo({ top: 0, behavior: "instant" });
      portfolioFocusTimer = window.setTimeout(() => {
        const main = document.getElementById("mainContent");
        if (main) main.focus({ preventScroll: true });
      }, 760);
    }

    window.dispatchEvent(new CustomEvent("experience:stage", {
      detail: { stage: nextStage, previousStage }
    }));
  }

  document.querySelectorAll("[data-stage-link]").forEach((button) => {
    button.addEventListener("click", () => {
      setStage(button.dataset.stageLink);
    });
  });

  document.querySelectorAll("[data-enter-portfolio]").forEach((button) => {
    button.addEventListener("click", () => setStage("portfolio"));
  });

  if (backToIntroButton) {
    backToIntroButton.addEventListener("click", () => {
      const openDialog = document.querySelector("dialog[open]");
      if (openDialog) openDialog.close();
      setStage("intro");
    });
  }

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || document.querySelector("dialog[open]")) return;
    if (currentStage === "intro") setStage("world");
    if (currentStage === "portfolio") setStage("intro");
  });

  window.experienceStage = {
    get: () => currentStage,
    set: setStage
  };

  setStage(currentStage);
})();
