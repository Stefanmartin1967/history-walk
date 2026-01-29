// photo-manager.js
import { DOM } from './ui.js';

export let currentPhotoList = [];
export let currentPhotoIndex = 0;

export function setCurrentPhotos(list, index) {
    currentPhotoList = list;
    currentPhotoIndex = index;
}

export function changePhoto(direction) {
    if (!currentPhotoList || currentPhotoList.length <= 1) return;
    currentPhotoIndex += direction;
    if (currentPhotoIndex >= currentPhotoList.length) currentPhotoIndex = 0;
    if (currentPhotoIndex < 0) currentPhotoIndex = currentPhotoList.length - 1;
    if (DOM.viewerImg) DOM.viewerImg.src = currentPhotoList[currentPhotoIndex];
}

export async function compressImage(file, targetMinSize = 800) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const elem = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const smallestSide = Math.min(width, height);
                if (smallestSide > targetMinSize) {
                    const ratio = targetMinSize / smallestSide;
                    width *= ratio;
                    height *= ratio;
                }
                elem.width = width;
                elem.height = height;
                const ctx = elem.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(elem.toDataURL('image/jpeg', 0.8)); 
            };
        };
    });
}