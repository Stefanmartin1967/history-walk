import { resizeImage } from './utils.js';

let activeResolve = null;

function getModalElements() {
    return {
        overlay: document.getElementById('custom-modal-overlay'),
        title: document.getElementById('custom-modal-title'),
        message: document.getElementById('custom-modal-message'),
        actions: document.getElementById('custom-modal-actions')
    };
}

function closeModal() {
    const { overlay } = getModalElements();
    if (overlay) overlay.classList.remove('active');
    activeResolve = null;
}

/**
 * Affiche une modale de sélection de photos.
 * @param {string} titleText - Titre de la modale.
 * @param {string} introText - Texte explicatif (ex: "Cluster X près de Y").
 * @param {Array} items - Liste d'objets { file, coords } à afficher.
 * @param {string} confirmLabel - Label du bouton de confirmation (défaut: "Importer").
 * @returns {Promise<Array|null>} - Retourne la liste des items sélectionnés ou null si annulé/passé.
 */
export function showPhotoSelectionModal(titleText, introText, items, confirmLabel = "Importer") {
    return new Promise((resolve) => {
        const { overlay, title, message, actions } = getModalElements();

        if (!overlay) {
            console.error("Modal overlay not found!");
            return resolve(null);
        }

        activeResolve = resolve;

        // 1. Setup Title
        title.textContent = titleText;

        // 2. Setup Message (Intro + Grid)
        message.innerHTML = '';

        const introP = document.createElement('div');
        introP.className = 'photo-selection-intro';
        introP.innerHTML = introText.replace(/\n/g, '<br>');
        message.appendChild(introP);

        // Container Grid
        const grid = document.createElement('div');
        grid.id = 'photo-selection-grid';
        message.appendChild(grid);

        // State tracking
        const selectionState = new Map(); // Index -> Boolean

        // 3. Generate Thumbnails
        items.forEach((item, index) => {
            // Default select all
            selectionState.set(index, true);

            const card = document.createElement('div');
            card.className = 'photo-selection-item selected';
            card.dataset.index = index;

            // Image Placeholder / Loading
            const img = document.createElement('img');
            img.src = ''; // Will be filled async
            img.alt = `Photo ${index + 1}`;

            // Checkmark Overlay
            const check = document.createElement('div');
            check.className = 'photo-selection-check';
            check.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

            card.appendChild(img);
            card.appendChild(check);
            grid.appendChild(card);

            // Interaction
            card.addEventListener('click', () => {
                const isSelected = !selectionState.get(index);
                selectionState.set(index, isSelected);

                if (isSelected) {
                    card.classList.add('selected');
                } else {
                    card.classList.remove('selected');
                }

                updateButtonState();
            });

            // Async Thumbnail Generation
            resizeImage(item.file, 200).then(base64 => {
                img.src = base64;
            }).catch(err => {
                console.error("Thumbnail error:", err);
                img.alt = "Erreur";
            });
        });

        // 4. Setup Actions
        actions.innerHTML = '';

        const btnImport = document.createElement('button');
        btnImport.className = 'custom-modal-btn primary';
        btnImport.textContent = `${confirmLabel} (${items.length})`;
        btnImport.onclick = () => {
            const selectedItems = items.filter((_, i) => selectionState.get(i));
            closeModal();
            resolve(selectedItems);
        };

        const btnSkip = document.createElement('button');
        btnSkip.className = 'custom-modal-btn secondary';
        btnSkip.textContent = "Passer / Ignorer";
        btnSkip.onclick = () => {
            closeModal();
            resolve(null); // Null means skip
        };

        actions.appendChild(btnImport);
        actions.appendChild(btnSkip);

        // Helper to update button text
        function updateButtonState() {
            const count = Array.from(selectionState.values()).filter(v => v).length;
            btnImport.textContent = count > 0 ? `${confirmLabel} (${count})` : `${confirmLabel} (0)`;
            btnImport.disabled = count === 0;
            if (count === 0) {
                btnImport.style.opacity = '0.5';
                btnImport.style.cursor = 'not-allowed';
            } else {
                btnImport.style.opacity = '1';
                btnImport.style.cursor = 'pointer';
            }
        }

        overlay.classList.add('active');
    });
}
