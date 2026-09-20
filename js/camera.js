/* =====================================================
   DocuApply — Camera
   ===================================================== */
window.DA = window.DA || {};

DA.camera = (function () {
  let stream = null;
  let onCapture = null;

  const $ = (id) => document.getElementById(id);

  function open(callback) {
    onCapture = callback;
    const modal = $('cameraModal');
    const video = $('cameraVideo');
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    })
      .then((s) => {
        stream = s;
        video.srcObject = s;
        modal.classList.remove('hidden');
      })
      .catch(() => DA.toast.error('Izin kamera ditolak atau tidak tersedia.'));
  }

  function close() {
    $('cameraModal').classList.add('hidden');
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    onCapture = null;
  }

  function capture() {
    const v = $('cameraVideo');
    const c = $('cameraCanvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    const dataUrl = c.toDataURL('image/jpeg', 0.92);
    const cb = onCapture;
    close();
    if (cb) cb(dataUrl);
  }

  function init() {
    $('cameraClose').addEventListener('click', close);
    $('cameraCapture').addEventListener('click', capture);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('cameraModal').classList.contains('hidden')) close();
    });
  }

  return { init, open, close, capture };
})();