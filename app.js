(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const startButton = $("#start-test");
  const startButtonLabel = $("#start-test-label");
  const recordButton = $("#record-button");
  const recordButtonLabel = $("#record-button-label");
  const deviceSelect = $("#device-select");
  const homeDeviceSelect = $("#home-device-select");
  const loadDevicesButton = $("#load-devices");
  const loadDevicesLabel = $("#load-devices-label");
  const homeDeviceHint = $("#home-device-hint");
  const waveform = $("#waveform");
  const waveformBars = [...waveform.querySelectorAll("span")];
  const meterShell = $("#meter-shell");
  const permissionState = $("#permission-state");
  const permissionLabel = $("#permission-label");
  const signalLabel = $("#signal-label");
  const levelValue = $("#level-value");
  const currentLevel = $("#current-level");
  const peakLevel = $("#peak-level");
  const sampleRate = $("#sample-rate");
  const channelCount = $("#channel-count");
  const detectedDevice = $("#detected-device");
  const liveDeviceName = $("#live-device-name");
  const lastTested = $("#last-tested");
  const recordingStatus = $("#recording-status");
  const errorBox = $("#tester-error");
  const audioPreviewWrap = $("#audio-preview-wrap");
  const audioPreview = $("#audio-preview");
  const downloadRecording = $("#download-recording");
  const recordingDuration = $("#recording-duration");
  const menuToggle = $(".menu-toggle");
  const mobileNav = $("#mobile-nav");
  const themeToggle = $("#theme-toggle");
  const themeToggleIcon = $(".theme-toggle-icon");
  const themeToggleText = $(".theme-toggle-text");
  const homeView = $("[data-home-view]");
  const testView = $("[data-test-view]");
  const backToHome = $("#back-to-home");
  const themeColor = $("[data-theme-color]");
  const revealSections = [...document.querySelectorAll("[data-reveal]")];

  let stream = null;
  let audioContext = null;
  let analyser = null;
  let source = null;
  let animationFrame = null;
  let peak = 0;
  let recorder = null;
  let recordingChunks = [];
  let recordingStartedAt = 0;
  let recordingTimer = null;
  let recordingUrl = null;
  let switchingDevice = false;
  let homeDeviceId = "";
  let homeDeviceLabel = "";
  let loadingHomeDevices = false;

  const themeStorageKey = "tym-theme";

  function setView(view) {
    const isTestView = view === "test";
    document.body.dataset.view = isTestView ? "test" : "home";
    homeView.hidden = isTestView;
    testView.hidden = !isTestView;
    if (isTestView) {
      window.requestAnimationFrame(() => testView.focus({ preventScroll: true }));
    } else {
      window.requestAnimationFrame(() => startButton.focus({ preventScroll: true }));
    }
  }

  function beginTest() {
    setView("test");
    startTest(homeDeviceId);
  }

  function selectedHomeLabel() {
    if (homeDeviceId && homeDeviceSelect) {
      const option = homeDeviceSelect.querySelector(`option[value="${CSS.escape(homeDeviceId)}"]`);
      if (option?.textContent) return option.textContent;
    }
    return homeDeviceLabel || "";
  }

  function updateStartButtonForHomeSelection() {
    if (homeDeviceId && selectedHomeLabel()) startButtonLabel.textContent = `Test ${selectedHomeLabel()}`;
    else if (!startButton.disabled) startButtonLabel.textContent = "Start microphone test";
  }

  function requestTestStart() {
    if (startButton.disabled) return;
    beginTest();
  }

  function setTheme(theme) {
    const nextTheme = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    document.body.dataset.theme = nextTheme;
    themeColor?.setAttribute("content", nextTheme === "light" ? "#f7f8fa" : "#111111");
    themeToggle?.setAttribute("aria-pressed", String(nextTheme === "light"));
    themeToggle?.setAttribute("aria-label", nextTheme === "light" ? "Theme: light. Switch to dark theme" : "Theme: dark. Switch to light theme");
    if (themeToggleIcon) themeToggleIcon.textContent = nextTheme === "light" ? "☾" : "☀";
    if (themeToggleText) themeToggleText.textContent = nextTheme === "light" ? "Light" : "Dark";
  }

  function getInitialTheme() {
    try {
      const savedTheme = localStorage.getItem(themeStorageKey);
      if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
    } catch {}
    return document.documentElement.dataset.theme === "light" ? "light" : "dark";
  }

  function setupScrollReveal() {
    if (!revealSections.length) return;
    const revealAll = () => {
      revealSections.forEach((section) => {
        section.classList.add("is-visible");
        section.querySelectorAll("[data-reveal-child]").forEach((child) => child.classList.add("is-visible"));
      });
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      revealAll();
      return;
    }

    const observer = new IntersectionObserver((entries, currentObserver) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        entry.target.querySelectorAll("[data-reveal-child]").forEach((child) => child.classList.add("is-visible"));
        currentObserver.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.08 });

    revealSections.forEach((section) => observer.observe(section));
  }

  function setPermissionState(state, label) {
    permissionState.classList.remove("is-running", "is-error");
    if (state === "running") permissionState.classList.add("is-running");
    if (state === "error") permissionState.classList.add("is-error");
    permissionLabel.textContent = label;
  }

  function showError(message) {
    errorBox.hidden = false;
    errorBox.textContent = message;
    setPermissionState("error", "Needs attention");
  }

  function clearError() {
    errorBox.hidden = true;
    errorBox.textContent = "";
  }

  function formatDeviceLabel(label, index) {
    return label || `Microphone ${index + 1}`;
  }

  function formatTime(date) {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  }

  function getSupportedMimeType() {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return "";
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
  }

  function stopAnimation() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  function resetMeter() {
    waveformBars.forEach((bar) => { bar.style.height = "11%"; });
    waveform.classList.remove("is-active");
    levelValue.textContent = "0%";
    currentLevel.textContent = "—";
    peakLevel.textContent = "—";
    signalLabel.textContent = "Waiting for permission";
  }

  function stopAudioResources() {
    stopAnimation();
    if (source) { source.disconnect(); source = null; }
    if (audioContext) { audioContext.close().catch(() => {}); audioContext = null; }
    if (stream) { stream.getTracks().forEach((track) => track.stop()); stream = null; }
    analyser = null;
  }

  function fillSelect(select, microphones, emptyLabel) {
    select.replaceChildren();
    if (!microphones.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = emptyLabel;
      select.append(option);
      select.disabled = true;
      return "";
    }
    microphones.forEach((device, index) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = formatDeviceLabel(device.label, index);
      select.append(option);
    });
    select.disabled = false;
    return microphones[0].deviceId;
  }

  async function listMicrophones() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      throw new Error("Microphone listing is not available in this browser. Try a recent version of Chrome, Edge, Firefox, or Safari over HTTPS or localhost.");
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === "audioinput");
  }

  function setHomeSelection(deviceId, label) {
    homeDeviceId = deviceId;
    homeDeviceLabel = label;
    if (!homeDeviceId) {
      detectedDevice.textContent = "Not started";
      liveDeviceName.textContent = "Not started";
    } else {
      const displayLabel = selectedHomeLabel() || homeDeviceLabel || "Selected microphone";
      detectedDevice.textContent = displayLabel;
    }
    updateStartButtonForHomeSelection();
  }

  async function loadHomeDevices() {
    if (loadingHomeDevices) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      homeDeviceHint.textContent = "Microphone access is not available in this browser. Try a recent version of Chrome, Edge, Firefox, or Safari over HTTPS or localhost.";
      return;
    }
    loadingHomeDevices = true;
    loadDevicesButton.disabled = true;
    loadDevicesLabel.textContent = "Requesting access…";
    homeDeviceHint.textContent = "Requesting one-time access to reveal microphone names.";
    let previewStream = null;
    try {
      previewStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const microphones = await listMicrophones();
      fillSelect(homeDeviceSelect, microphones, "No microphone detected");
      if (microphones.length) {
        setHomeSelection(microphones[0].deviceId, formatDeviceLabel(microphones[0].label, 0));
        homeDeviceHint.textContent = "Names revealed. Choose a microphone, then start the test.";
      } else {
        setHomeSelection("", "");
        homeDeviceHint.textContent = "No microphone was found. Connect an input device and try again.";
      }
    } catch (error) {
      const name = error?.name;
      homeDeviceHint.textContent = name === "NotAllowedError" || name === "PermissionDeniedError"
        ? "Microphone permission was denied. Allow access, then try again."
        : error?.message || "The microphone list could not be loaded. Check the device connection and try again.";
    } finally {
      if (previewStream) previewStream.getTracks().forEach((track) => track.stop());
      loadingHomeDevices = false;
      loadDevicesButton.disabled = false;
      loadDevicesLabel.textContent = homeDeviceSelect.options.length ? "Refresh microphones" : "Show microphones";
    }
  }

  async function populateDevices(preferredDeviceId = "") {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const microphones = await listMicrophones();
    const selected = fillSelect(deviceSelect, microphones, "No microphone detected");
    if (!microphones.length) {
      homeDeviceSelect.replaceChildren();
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No microphone detected";
      homeDeviceSelect.append(option);
      homeDeviceSelect.disabled = true;
      return;
    }
    const resolved = microphones.some((device) => device.deviceId === preferredDeviceId) ? preferredDeviceId : selected;
    const matched = microphones.find((device) => device.deviceId === resolved);
    deviceSelect.value = resolved;
    if (homeDeviceSelect.options.length) {
      homeDeviceSelect.value = microphones.some((device) => device.deviceId === homeDeviceSelect.value)
        ? homeDeviceSelect.value
        : resolved;
    }
    if (preferredDeviceId && matched) {
      homeDeviceId = resolved;
      homeDeviceLabel = formatDeviceLabel(matched.label, microphones.indexOf(matched));
    }
  }

  function drawMeter() {
    if (!analyser) return;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let index = 0; index < data.length; index += 1) {
      const normalized = (data[index] - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / data.length);
    const level = Math.min(100, Math.round(rms * 300));
    peak = Math.max(peak * 0.992, level);
    const chunkSize = Math.max(1, Math.floor(data.length / waveformBars.length));
    waveformBars.forEach((bar, index) => {
      let localPeak = 0;
      const start = index * chunkSize;
      const end = Math.min(data.length, start + chunkSize);
      for (let pointer = start; pointer < end; pointer += 1) localPeak = Math.max(localPeak, Math.abs(data[pointer] - 128) / 128);
      const height = Math.max(9, Math.min(100, localPeak * 190 + level * 0.25));
      bar.style.height = `${height}%`;
    });
    waveform.classList.add("is-active");
    levelValue.textContent = `${level}%`;
    currentLevel.textContent = `${level}%`;
    peakLevel.textContent = `${Math.round(peak)}%`;
    signalLabel.textContent = level > 4 ? "Signal detected" : "Listening for signal";
    animationFrame = requestAnimationFrame(drawMeter);
  }

  async function createAudioGraph() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error("Your browser does not support the audio analysis needed for this test.");
    audioContext = new AudioContextClass();
    await audioContext.resume();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.76;
    source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
  }

  async function startTest(deviceId = "") {
    if (!navigator.mediaDevices?.getUserMedia) {
      showError("Microphone access is not available in this browser. Try a recent version of Chrome, Edge, Firefox, or Safari over HTTPS or localhost.");
      return;
    }
    clearError();
    startButton.disabled = true;
    startButtonLabel.textContent = "Requesting access…";
    try {
      const audio = deviceId ? { deviceId: { exact: deviceId } } : true;
      stream = await navigator.mediaDevices.getUserMedia({ audio });
      const track = stream.getAudioTracks()[0];
      const settings = track.getSettings ? track.getSettings() : {};
      await createAudioGraph();
      peak = 0;
      setPermissionState("running", "Testing");
      startButton.classList.add("is-stop");
      startButtonLabel.textContent = "Stop microphone test";
      startButton.disabled = false;
      recordButton.disabled = false;
      recordButtonLabel.textContent = "Record a clip";
      signalLabel.textContent = "Listening for signal";
      const deviceLabel = track.label || selectedHomeLabel() || "Microphone access granted";
      detectedDevice.textContent = deviceLabel;
      liveDeviceName.textContent = `Testing: ${deviceLabel}`;
      homeDeviceId = settings.deviceId || deviceId || homeDeviceId;
      homeDeviceLabel = deviceLabel;
      lastTested.textContent = formatTime(new Date());
      sampleRate.textContent = settings.sampleRate ? `${settings.sampleRate} Hz` : audioContext.sampleRate ? `${audioContext.sampleRate} Hz` : "—";
      channelCount.textContent = settings.channelCount ? `${settings.channelCount}` : "—";
      meterShell.classList.add("is-running");
      await populateDevices(settings.deviceId || deviceId);
      drawMeter();
      navigator.mediaDevices.addEventListener?.("devicechange", handleDeviceChange);
    } catch (error) {
      stopAudioResources();
      startButton.disabled = false;
      startButtonLabel.textContent = "Start microphone test";
      const name = error?.name;
      const message = name === "NotAllowedError" || name === "PermissionDeniedError"
        ? "Microphone permission was denied. Allow microphone access in your browser settings, then try again."
        : name === "NotFoundError"
          ? "No microphone was found. Connect an input device and try again."
          : name === "NotReadableError"
            ? "The microphone is unavailable, possibly because another app is using it. Close other audio apps and try again."
            : "The microphone could not be started. Check your device connection and browser permissions, then try again.";
      showError(message);
    }
  }

  async function stopTest() {
    if (recorder && recorder.state === "recording") recorder.stop();
    stopAudioResources();
    navigator.mediaDevices?.removeEventListener?.("devicechange", handleDeviceChange);
    setPermissionState("ready", "Ready");
    startButton.classList.remove("is-stop");
    startButtonLabel.textContent = "Start microphone test";
    recordButton.disabled = true;
    signalLabel.textContent = "Test stopped";
    liveDeviceName.textContent = "Not started";
    sampleRate.textContent = "—";
    channelCount.textContent = "—";
    resetMeter();
    recordingStatus.textContent = "Start the test before recording.";
  }

  async function handleDeviceChange() {
    if (!stream || switchingDevice) return;
    await populateDevices(deviceSelect.value);
  }

  async function switchDevice() {
    if (!stream || !deviceSelect.value || switchingDevice) return;
    switchingDevice = true;
    const selectedDevice = deviceSelect.value;
    const wasRecording = recorder?.state === "recording";
    if (wasRecording) recorder.stop();
    stopAudioResources();
    await startTest(selectedDevice);
    switchingDevice = false;
  }

  function stopRecordingUi() {
    recordButton.classList.remove("is-recording");
    recordButtonLabel.textContent = "Record a clip";
    clearTimeout(recordingTimer);
    recordingTimer = null;
  }

  function finishRecording() {
    const blob = new Blob(recordingChunks, { type: recorder?.mimeType || "audio/webm" });
    recordingChunks = [];
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    recordingUrl = URL.createObjectURL(blob);
    audioPreview.src = recordingUrl;
    downloadRecording.href = recordingUrl;
    audioPreviewWrap.classList.remove("is-empty");
    downloadRecording.classList.remove("is-disabled");
    downloadRecording.setAttribute("aria-disabled", "false");
    recordingDuration.textContent = `${Math.max(1, Math.round((Date.now() - recordingStartedAt) / 1000))} sec clip`;
    recordingStatus.textContent = "Clip ready — play it back to hear your mic.";
    stopRecordingUi();
  }

  function startRecording() {
    if (!stream) return;
    if (!window.MediaRecorder) {
      recordingStatus.textContent = "Recording is not supported in this browser.";
      return;
    }
    try {
      const mimeType = getSupportedMimeType();
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recordingChunks = [];
      recordingStartedAt = Date.now();
      recorder.addEventListener("dataavailable", (event) => { if (event.data.size) recordingChunks.push(event.data); });
      recorder.addEventListener("stop", finishRecording, { once: true });
      recorder.start();
      recordButton.classList.add("is-recording");
      recordButtonLabel.textContent = "Stop recording";
      recordingStatus.textContent = "Recording locally… max 30 seconds.";
      recordingTimer = setTimeout(() => { if (recorder?.state === "recording") recorder.stop(); }, 30000);
    } catch {
      recordingStatus.textContent = "This browser could not start a local recording.";
    }
  }

  function toggleRecording() {
    if (!recorder || recorder.state !== "recording") startRecording();
    else recorder.stop();
  }

  startButton.addEventListener("click", requestTestStart);
  loadDevicesButton.addEventListener("click", loadHomeDevices);
  homeDeviceSelect.addEventListener("change", () => {
    const option = homeDeviceSelect.selectedOptions[0];
    setHomeSelection(homeDeviceSelect.value, option?.textContent || "");
  });
  backToHome.addEventListener("click", async () => {
    await stopTest();
    setView("home");
  });
  recordButton.addEventListener("click", toggleRecording);
  deviceSelect.addEventListener("change", switchDevice);
  downloadRecording.addEventListener("click", (event) => {
    if (downloadRecording.classList.contains("is-disabled")) event.preventDefault();
  });

  setTheme(getInitialTheme());
  themeToggle.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    try { localStorage.setItem(themeStorageKey, nextTheme); } catch {}
  });

  menuToggle.addEventListener("click", () => {
    const isOpen = mobileNav.classList.toggle("is-open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });
  mobileNav.addEventListener("click", (event) => {
    if (event.target.closest("a")) { mobileNav.classList.remove("is-open"); menuToggle.setAttribute("aria-expanded", "false"); }
  });

  setView("home");
  setupScrollReveal();

  window.addEventListener("beforeunload", () => {
    if (recorder?.state === "recording") recorder.stop();
    stopAudioResources();
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
  });
})();