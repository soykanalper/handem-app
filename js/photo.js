// ---------------------------------------------------------------------------
// photo.js — camera capture + gallery selection for cheque photos, using the
// two hidden <input type=file> elements declared in index.html. Images are
// compressed client-side (util.compressImage) before being stored as a
// dataURL string directly on the cheque record in IndexedDB — simplest
// reliable approach for a single-user local-first app with no extra binary
// object store to keep in sync.
// ---------------------------------------------------------------------------
import { compressImage, toast } from './util.js';

export function pickPhoto(source) {
  return new Promise((resolve) => {
    const input = document.getElementById(source === 'camera' ? 'cameraInput' : 'galleryInput');
    if (!input) return resolve(null);
    const handler = async () => {
      input.removeEventListener('change', handler);
      const file = input.files && input.files[0];
      input.value = '';
      if (!file) return resolve(null);
      try {
        const dataUrl = await compressImage(file, 1000, 0.68);
        resolve(dataUrl);
      } catch (e) {
        toast('Fotoğraf işlenemedi', 'error');
        resolve(null);
      }
    };
    input.addEventListener('change', handler);
    input.click();
  });
}
