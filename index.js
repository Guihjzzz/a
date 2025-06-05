import { extractStructureFilesFromMcworld } from "mcbe-leveldb-reader";
import { selectEl, downloadBlob, sleep, selectEls, loadTranslationLanguage, translate, getStackTrace, random, UserError, joinOr, conditionallyGroup, groupByFileExtension, addFilesToFileInput, setFileInputFiles, dispatchInputEvents } from "./essential.js";
import * as HoloPrint from "./HoloPrint.js";
import SupabaseLogger from "./SupabaseLogger.js";

import ResourcePackStack from "./ResourcePackStack.js";
import LocalResourcePack from "./LocalResourcePack.js";
import TextureAtlas from "./TextureAtlas.js";
import ItemCriteriaInput from "./components/ItemCriteriaInput.js";
import FileInputTable from "./components/FileInputTable.js";
import SimpleLogger from "./components/SimpleLogger.js";

const IN_PRODUCTION = false;
const ACTUAL_CONSOLE_LOG = false; 

const supabaseProjectUrl = "https://gnzyfffwvulwxbczqpgl.supabase.co";
const supabaseApiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImduenlmZmZ3dnVsd3hiY3pxcGdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjMwMjE3NzgsImV4cCI6MjAzODU5Nzc3OH0.AWMhFcP3PiMD3dMC_SeIVuPx128KVpgfkZ5qBStDuVw";

window.OffscreenCanvas ??= class OffscreenCanvas {
	constructor(w, h) {
		console.debug("Using OffscreenCanvas polyfill");
		this.canvas = document.createElement("canvas");
		this.canvas.width = w;
		this.canvas.height = h;
		this.canvas.convertToBlob = () => {
			return new Promise((res, rej) => {
				this.canvas.toBlob(blob => {
					if(blob) {
						res(blob);
					} else {
						rej(new Error("Canvas to Blob conversion failed"));
					}
				});
			});
		};
		return this.canvas;
	}
};

let dropFileNotice;
let generatePackForm;
let generatePackFormSubmitButton;
let structureFilesInput;
let worldFileInput;
let oldPackInput;
let structureFilesList;
let packNameInput;
let completedPacksCont;
let logger;
let languageSelector;
let defaultResourcePackStackPromise;
let supabaseLogger;
let texturePreviewImageCont;
let texturePreviewImage;
let themeToggleButton;
let primaryColorPicker;
let secondaryColorPicker;
let buttonHoverColorPicker;
let clearResourcePackCacheButton; 
let allSettingsContainerDetails; // Para o <details> principal

let initialTranslationsApplied = false;
let languageIsLoading = false;

// Função para simular progresso (substitua pela sua lógica real se tiver uma)
function simulateProgress(duration = 2000) {
    const progressBarContainer = document.getElementById('customProgressBarContainer');
    const progressBar = document.getElementById('customProgressBar');
    if (!progressBarContainer || !progressBar) return;

    progressBarContainer.classList.remove('hidden');
    progressBar.style.width = '0%';
    progressBar.textContent = '0%';

    let progress = 0;
    const intervalTime = duration / 100; // Atualiza a cada 1%
    const interval = setInterval(() => {
        progress++;
        progressBar.style.width = progress + '%';
        progressBar.textContent = progress + '%';
        if (progress >= 100) {
            clearInterval(interval);
            // Adia o esconder da barra para depois que o botão de download/erro aparecer
            // setTimeout(() => progressBarContainer.classList.add('hidden'), 500);
        }
    }, intervalTime);
}


async function initializePage() {
    document.body.appendChild = selectEl("main").appendChild.bind(selectEl("main"));

    selectEls(`input[type="file"][accept]:not([multiple])`).forEach(input => {
        input.addEventListener("input", e => {
            if (!validateFileInputFileTypes(input)) {
                e?.stopImmediatePropagation();
            }
        });
        if (input.files && input.files.length > 0) {
            validateFileInputFileTypes(input);
        }
    });

    generatePackForm = selectEl("#generatePackForm");
    dropFileNotice = selectEl("#dropFileNotice");
    structureFilesInput = selectEl("#structureFilesInput");
    allSettingsContainerDetails = selectEl("#allSettingsContainer"); // Seleciona o <details>

    let notStructureFileError = selectEl("#notStructureFileError");
    worldFileInput = selectEl("#worldFileInput");
    let worldExtractionMessage = selectEl("#worldExtractionMessage");
    let worldExtractionSuccess = selectEl("#worldExtractionSuccess");
    let worldExtractionError = selectEl("#worldExtractionError");
    let worldExtractionWorldError = selectEl("#worldExtractionWorldError");
    oldPackInput = selectEl("#oldPackInput");
    let oldPackExtractionMessage = selectEl("#oldPackExtractionMessage");
    let oldPackExtractionSuccess = selectEl("#oldPackExtractionSuccess");
    let oldPackExtractionError = selectEl("#oldPackExtractionError");
    structureFilesList = selectEl("#structureFilesList");

    packNameInput = generatePackForm.elements.namedItem("packName");
    if (packNameInput) {
        packNameInput.addEventListener("invalid", () => {
            packNameInput.setCustomValidity(translateCurrentLanguage("metadata.pack_name.error"));
        });
        packNameInput.addEventListener("input", () => {
            packNameInput.setCustomValidity("");
        });
    }

    if(structureFilesInput){
        structureFilesInput.addEventListener("input", () => {
            if (!structureFilesInput.files.length) return;
            let files = Array.from(structureFilesInput.files);
            let filesToAdd = files.filter(file => file.name.endsWith(".mcstructure"));
            if (files.length == filesToAdd.length) {
                notStructureFileError.classList.add("hidden");
                structureFilesInput.setCustomValidity("");
            } else {
                notStructureFileError.classList.remove("hidden");
                structureFilesInput.setCustomValidity(notStructureFileError.textContent || translateCurrentLanguage("structure_files.error"));
            }
            addFilesToFileInput(structureFilesList, filesToAdd);
            if (allSettingsContainerDetails && filesToAdd.length > 0) { // Abrir settings se arquivos forem carregados
                allSettingsContainerDetails.open = true;
            }
        });
    }

    if (worldFileInput && worldExtractionMessage && worldExtractionSuccess && worldExtractionError && worldExtractionWorldError) {
        worldFileInput.addEventListener("input", async () => {
            worldExtractionMessage.classList.add("hidden");
            worldExtractionSuccess.classList.add("hidden");
            worldExtractionError.classList.add("hidden");
            worldExtractionWorldError.classList.add("hidden");
            if (oldPackInput) oldPackInput.setCustomValidity("");
            let worldFile = worldFileInput.files[0];
            if (!worldFile) return;

            worldExtractionMessage.classList.remove("hidden");
            worldExtractionMessage.scrollIntoView({ block: "center", behavior: "smooth" });
            let structureFiles;
            try {
                structureFiles = await extractStructureFilesFromMcworld(worldFile);
            } catch (e) {
                worldExtractionMessage.classList.add("hidden");
                worldExtractionWorldError.dataset.translationSubError = e.message;
                worldExtractionWorldError.classList.remove("hidden");
                worldFileInput.setCustomValidity(worldExtractionWorldError.textContent);
                if(languageSelector?.value) await translatePage(languageSelector.value);
                return;
            }
            worldExtractionMessage.classList.add("hidden");
            if (structureFiles && structureFiles.size) {
                addFilesToFileInput(structureFilesList, Array.from(structureFiles.values()));
                worldExtractionSuccess.dataset.translationSubCount = structureFiles.size.toString();
                worldExtractionSuccess.classList.remove("hidden");
                 if (allSettingsContainerDetails) allSettingsContainerDetails.open = true;
            } else {
                worldExtractionError.classList.remove("hidden");
                worldFileInput.setCustomValidity(worldExtractionError.textContent);
            }
            if(languageSelector?.value) await translatePage(languageSelector.value);
        });
    }

    if (oldPackInput && oldPackExtractionMessage && oldPackExtractionSuccess && oldPackExtractionError) {
        oldPackInput.addEventListener("input", async () => {
            oldPackExtractionMessage.classList.add("hidden");
            oldPackExtractionSuccess.classList.add("hidden");
            oldPackExtractionError.classList.add("hidden");
            oldPackInput.setCustomValidity("");
            let oldPack = oldPackInput.files[0];
            if (!oldPack) return;
            oldPackExtractionMessage.classList.remove("hidden");
            oldPackExtractionMessage.scrollIntoView({ block: "center", behavior: "smooth" });
            let extractedStructureFiles = [];
            try {
                extractedStructureFiles = await HoloPrint.extractStructureFilesFromPack(oldPack);
            } catch (e) {
                console.error("Failed to extract files from old pack:", e);
                const errorKey = "update_pack.error";
                let errorMessage = translateCurrentLanguage(errorKey) || "Error processing pack.";
                 if (e.message) errorMessage += ` (Details: ${e.message})`;
                oldPackExtractionError.innerHTML = errorMessage; 
            }
            oldPackExtractionMessage.classList.add("hidden");
            if (extractedStructureFiles.length) {
                addFilesToFileInput(structureFilesList, extractedStructureFiles);
                oldPackExtractionSuccess.classList.remove("hidden");
                if (allSettingsContainerDetails) allSettingsContainerDetails.open = true;
            } else {
                oldPackExtractionError.classList.remove("hidden");
                oldPackInput.setCustomValidity(oldPackExtractionError.textContent);
            }
             if(languageSelector?.value) await translatePage(languageSelector.value);
        });
    }
    
    if (structureFilesList) {
        structureFilesList.addEventListener("input", ()=>{
            updatePackNameInputPlaceholder();
            if (structureFilesList.files.length > 0 && allSettingsContainerDetails) {
                allSettingsContainerDetails.open = true; // Abrir settings se arquivos forem carregados
            }
        });
        updatePackNameInputPlaceholder();
    }

    completedPacksCont = selectEl("#completedPacksCont");
    texturePreviewImageCont = selectEl("#texturePreviewImageCont");
    defaultResourcePackStackPromise = new ResourcePackStack();

    if (location.search == "?loadFile") {
        window.launchQueue?.setConsumer(async launchParams => {
            if (launchParams.files && launchParams.files.length > 0) {
                let launchFiles = await Promise.all(launchParams.files.map(fileHandle => fileHandle.getFile()));
                handleInputFiles(launchFiles);
            }
        });
    }

    let dragCounter = 0;
    document.documentElement.addEventListener("dragenter", () => dragCounter++);
    document.documentElement.addEventListener("dragover", e => {
        if (e.dataTransfer?.types?.includes("Files")) {
            e.preventDefault();
            if (dropFileNotice) dropFileNotice.classList.remove("hidden");
        }
    });
    document.documentElement.addEventListener("dragleave", () => {
        dragCounter--;
        if (dragCounter == 0 && dropFileNotice) dropFileNotice.classList.add("hidden");
    });
    document.documentElement.addEventListener("drop", async e => {
        e.preventDefault();
        dragCounter = 0;
        if (dropFileNotice) dropFileNotice.classList.add("hidden");
        let files = [...e.dataTransfer.files];
        handleInputFiles(files);
         if (allSettingsContainerDetails && files.length > 0) { // Abrir settings após drop
            allSettingsContainerDetails.open = true;
        }
    });

    if (!customElements.get("item-criteria-input")) {
        customElements.define("item-criteria-input", class extends ItemCriteriaInput {
            constructor() { super(translateCurrentLanguage); }
        });
    }
    if (!customElements.get("file-input-table")) {
        customElements.define("file-input-table", FileInputTable);
    }
    if (!customElements.get("simple-logger")) {
        customElements.define("simple-logger", SimpleLogger);
    }
    
    if (!ACTUAL_CONSOLE_LOG) {
        logger = selectEl("#log");
        if (logger) logger.patchConsoleMethods();
    }

    generatePackForm.addEventListener("submit", async e => {
        e.preventDefault();
        let formData = new FormData(generatePackForm);
        
        let localResourcePackInput = generatePackForm.elements.namedItem("localResourcePack");
        let localResourcePackFiles = localResourcePackInput?.files;
        let resourcePacks = [];
		if(localResourcePackFiles && localResourcePackFiles.length) {
			resourcePacks.push(await new LocalResourcePack(localResourcePackFiles));
		}

        let packIconInputElement = generatePackForm.elements.namedItem("packIcon");
        let packIconBlobValue = packIconInputElement?.files[0]?.size ? packIconInputElement.files[0] : undefined;


        /** @type {import("./HoloPrint.js").HoloPrintConfig} */
        let configObject = {
            IGNORED_BLOCKS: formData.get("ignoredBlocks")?.split(/\W/).removeFalsies() ?? [],
            SCALE: parseFloat(formData.get("scale")) / 100,
            OPACITY: parseFloat(formData.get("opacityMode") === "single" && formData.get("opacity") ? formData.get("opacity") : HoloPrint.addDefaultConfig({}).OPACITY * 100) / 100,
            MULTIPLE_OPACITIES: formData.get("opacityMode") == "multiple",
            TINT_COLOR: formData.get("tintColor"),
            TINT_OPACITY: parseFloat(formData.get("tintOpacity")) / 100,
            MINI_SCALE: +formData.get("miniSize"),
            TEXTURE_OUTLINE_WIDTH: +formData.get("textureOutlineWidth"),
            TEXTURE_OUTLINE_COLOR: formData.get("textureOutlineColor"),
            TEXTURE_OUTLINE_OPACITY: parseFloat(formData.get("textureOutlineOpacity")) / 100,
            SPAWN_ANIMATION_ENABLED: !!formData.get("spawnAnimationEnabled"),
            PLAYER_CONTROLS_ENABLED: !!formData.get("playerControlsEnabled"),
            MATERIAL_LIST_ENABLED: !!formData.get("materialListEnabled"),
            RETEXTURE_CONTROL_ITEMS: !!formData.get("retextureControlItems"), 
            RENAME_CONTROL_ITEMS: !!formData.get("renameControlItems"),    
            CONTROLS: Object.fromEntries([...formData].filter(([key]) => key.startsWith("control.")).map(([key, value]) => [key.replace(/^control./, ""), JSON.parse(value)])),
            INITIAL_OFFSET: [+formData.get("initialOffsetX"), +formData.get("initialOffsetY"), +formData.get("initialOffsetZ")],
            BACKUP_SLOT_COUNT: +formData.get("backupSlotCount"),
            PACK_NAME: formData.get("packName") || undefined,
            PACK_ICON_BLOB: packIconBlobValue,
            AUTHORS: formData.get("author")?.split(",").map(x => x.trim()).removeFalsies() ?? [],
            DESCRIPTION: formData.get("description") || undefined,
            COMPRESSION_LEVEL: formData.has("compressionLevel") ? +formData.get("compressionLevel") : 5,
            PREVIEW_BLOCK_LIMIT: HoloPrint.addDefaultConfig({}).PREVIEW_BLOCK_LIMIT,
            SHOW_PREVIEW_SKYBOX: HoloPrint.addDefaultConfig({}).SHOW_PREVIEW_SKYBOX,
            CONTROL_ITEM_TEXTURE_SCALE: +formData.get("controlItemTextureScale") || HoloPrint.addDefaultConfig({}).CONTROL_ITEM_TEXTURE_SCALE,
        };
        
        let currentResourcePackStack = await new ResourcePackStack(resourcePacks);
        simulateProgress(2200); // Inicia a barra de progresso
        makePackAndHandleUI(formData.getAll("structureFiles"), configObject, currentResourcePackStack);
    });

    if (generatePackForm.elements.namedItem("textureOutlineWidth")) {
        generatePackForm.addEventListener("input", e => {
            if (e.target.closest("fieldset")?.classList?.contains("textureSettings") && e.target.hasAttribute("name")) {
                updateTexturePreview();
            }
        });
        updateTexturePreview();
    }
    generatePackFormSubmitButton = generatePackForm.elements.namedItem("submit");

    let opacityModeSelect = generatePackForm.elements.namedItem("opacityMode");
    if (opacityModeSelect) {
        const opacitySettingRow = generatePackForm.elements.namedItem("opacity")?.closest("label");
        opacityModeSelect.addEventListener("change", () => {
            if (opacitySettingRow) {
                opacitySettingRow.classList.toggle("hidden", opacityModeSelect.value == "multiple");
            }
        });
        dispatchInputEvents(opacityModeSelect);
    }

    let descriptionTextArea = generatePackForm.elements.namedItem("description");
    let descriptionLinksCont = selectEl("#descriptionLinksCont");
    if (descriptionTextArea && descriptionLinksCont) {
        descriptionTextArea.addEventListener("input", async () => { 
            let links = HoloPrint.findLinksInDescription(descriptionTextArea.value);
            descriptionLinksCont.textContent = "";
            links.forEach(([label, link], i) => {
                if (i) descriptionLinksCont.appendChild(document.createElement("br"));
                const span = document.createElement('span'); // Criar span para o texto traduzido
                span.dataset.translate = "metadata.description.link_found";
                descriptionLinksCont.appendChild(span);
                descriptionLinksCont.insertAdjacentText("beforeend", " " + link);
            });
            if(languageSelector?.value && initialTranslationsApplied) await translatePage(languageSelector.value);
        });
        dispatchInputEvents(descriptionTextArea);
    }

    let playerControlsInputCont = selectEl("#playerControlsInputCont");
    if (playerControlsInputCont) {
        Object.entries(HoloPrint.DEFAULT_PLAYER_CONTROLS).forEach(([control, itemCriteria]) => {
            let label = document.createElement("label");
            let playerControlTranslationKey = HoloPrint.PLAYER_CONTROL_NAMES[control];
            label.innerHTML = `<span data-translate="${playerControlTranslationKey}"></span>:`;
            let input = document.createElement("item-criteria-input");
            input.setAttribute("name", `control.${control}`);
            if (itemCriteria["names"].length > 0) input.setAttribute("value-items", itemCriteria["names"].join(","));
            if (itemCriteria["tags"].length > 0) input.setAttribute("value-tags", itemCriteria["tags"].join(","));
            label.appendChild(input);
            playerControlsInputCont.appendChild(label);
            input.setAttribute("default", input.value);
        });
    }
    
    clearResourcePackCacheButton = selectEl("#clearResourcePackCacheButton");
    if (clearResourcePackCacheButton) { 
        clearResourcePackCacheButton.addEventListener("click", async () => {
            try {
                await caches.clear();
                console.info("All caches cleared.");
                await temporarilyChangeText(clearResourcePackCacheButton, clearResourcePackCacheButton.dataset.resetTranslation || "Cache cleared!");
            } catch (err) {
                 console.error("Failed to clear caches:", err);
                await temporarilyChangeText(clearResourcePackCacheButton, "Error clearing cache", 3000);
            }
        });
    }
		
	selectEls(".resetButton").forEach(el => {
		el.addEventListener("click", async () => { 
            let fieldset = el.closest("fieldset"); 
            if (!fieldset) return;

            let elementsToResetInFieldset = fieldset.querySelectorAll('input:not([type="hidden"]), select, textarea, item-criteria-input');
            
            elementsToResetInFieldset.forEach(formEl => {
                if (formEl.type === 'checkbox') {
                    formEl.checked = formEl.hasAttribute('checked'); 
                } else if (formEl.tagName === 'ITEM-CRITERIA-INPUT') {
                    formEl.value = formEl.getAttribute('default') || '';
                } else if (formEl.type === 'color') {
                     formEl.value = formEl.defaultValue || '#000000'; // Fallback para cor preta se não houver default
                }
                 else {
                    formEl.value = formEl.defaultValue || ''; 
                }
                dispatchInputEvents(formEl); 
            });
			await temporarilyChangeText(el, el.dataset.resetTranslation || 'Settings reset!');
		});
	});
	
	languageSelector = selectEl("#languageSelector");
	if (languageSelector) {
        try {
            const langResponse = await fetch("translations/languages.json");
            if (!langResponse.ok) throw new Error(`Failed to fetch languages.json: ${langResponse.status}`);
            const languagesAndNames = await langResponse.jsonc();
            
            const sortedLanguages = Object.fromEntries(Object.entries(languagesAndNames).sort((a, b) => a[1].localeCompare(b[1])));
            const availableLanguages = Object.keys(sortedLanguages);

            if (availableLanguages.length <= 1 && selectEl("#languageSelectorCont")) {
                selectEl("#languageSelectorCont").remove();
                await translatePage("en_US");
            } else {
                let defaultLanguage = navigator.languages.find(navigatorLanguage => {
                    let navigatorBaseLanguage = navigatorLanguage.split("-")[0].toLowerCase();
                    return availableLanguages.find(availableLanguage => availableLanguage.toLowerCase() == navigatorLanguage.toLowerCase()) ?? 
                           availableLanguages.find(availableLanguage => availableLanguage.toLowerCase() == navigatorBaseLanguage) ?? 
                           availableLanguages.find(availableLanguage => availableLanguage.split(/-|_/)[0].toLowerCase() == navigatorBaseLanguage);
                }) ?? "en_US";

                languageSelector.innerHTML = '';
                for (let language in sortedLanguages) {
                    languageSelector.appendChild(new Option(sortedLanguages[language], language, false, language == defaultLanguage));
                }
                languageSelector.value = defaultLanguage;

                languageSelector.addEventListener("change", async () => {
                    await translatePage(languageSelector.value);
                });
                await translatePage(defaultLanguage); 
            }
        } catch (error) {
            console.error("Error loading or processing languages:", error);
            await translatePage("en_US");
            if (selectEl("#languageSelectorCont")) selectEl("#languageSelectorCont").style.display = 'none';
        }
    } else {
        await translatePage("en_US");
    }
    initialTranslationsApplied = true; // Mover para cá
    applySavedThemeAndColors(); // Aplicar tema APÓS a primeira tradução e carregamento de idiomas

    themeToggleButton = selectEl("#themeToggleButton");
    primaryColorPicker = selectEl("#primaryColorPicker");
    secondaryColorPicker = selectEl("#secondaryColorPicker");
    buttonHoverColorPicker = selectEl("#buttonHoverColorPicker");

    if(themeToggleButton) {
        themeToggleButton.addEventListener("click", () => {
            const currentTheme = document.body.classList.contains("dark-mode") ? "dark" : "light";
            applyTheme(currentTheme === "dark" ? "light" : "dark");
        });
    }

    if(primaryColorPicker) primaryColorPicker.addEventListener("input", (event) => applyPrimaryColor(event.target.value));
    if(secondaryColorPicker) secondaryColorPicker.addEventListener("input", (event) => applySecondaryColor(event.target.value));
    if(buttonHoverColorPicker) buttonHoverColorPicker.addEventListener("input", (event) => applyButtonHoverColor(event.target.value));
        
    let retranslating = false;
    const observerCallback = async (mutationsList) => {
        if (retranslating || languageIsLoading) return;
        let needsRetranslation = false;
        for (const mutation of mutationsList) {
             if (mutation.type === 'childList') {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        let currentNodeToCheck = node;
                        let checkQueue = [currentNodeToCheck];
                        while(checkQueue.length > 0){
                            currentNodeToCheck = checkQueue.shift();
                            if (currentNodeToCheck.hasAttribute && (currentNodeToCheck.hasAttribute('data-translate') || Object.keys(currentNodeToCheck.dataset || {}).some(key => key.startsWith('translate')) )) {
                                needsRetranslation = true; break;
                            }
                            if(currentNodeToCheck.shadowRoot){
                                if(currentNodeToCheck.shadowRoot.querySelector('[data-translate]')){
                                     needsRetranslation = true; break;
                                }
                                currentNodeToCheck.shadowRoot.querySelectorAll('*').forEach(childEl => checkQueue.push(childEl));
                            }
                             if(!currentNodeToCheck.shadowRoot && currentNodeToCheck.childNodes){
                                currentNodeToCheck.childNodes.forEach(childNode => {
                                    if(childNode.nodeType === Node.ELEMENT_NODE) checkQueue.push(childNode);
                                });
                            }
                        }
                        if (needsRetranslation) break;
                    }
                }
            } else if (mutation.type === 'attributes') {
                if (mutation.attributeName.startsWith('data-translate') && mutation.target.getAttribute(mutation.attributeName) !== mutation.oldValue) {
                    needsRetranslation = true;
                }
            }
            if (needsRetranslation) break;
        }

        if (needsRetranslation) {
            retranslating = true;
            if(languageSelector?.value) await translatePage(languageSelector.value);
            requestAnimationFrame(() => { retranslating = false; });
        }
    };

    const bodyObserver = new MutationObserver(observerCallback);
    const observerConfig = {
        childList: true,
        subtree: true,
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ['data-translate', 'data-translate-title', 'data-translate-placeholder', 'data-translation-sub-count', 'data-translation-sub-error']
    };
    bodyObserver.observe(document.body, observerConfig);
    document.body.querySelectorAll('*').forEach(el => {
        if (el.shadowRoot) {
            const shadowObserver = new MutationObserver(observerCallback);
            shadowObserver.observe(el.shadowRoot, observerConfig);
        }
    });
} 

function applyTheme (theme) {
    if (!document.body) return; // Checagem adicional
    if (document.body.classList.contains("dark-mode") && theme === "dark") return;
    if (!document.body.classList.contains("dark-mode") && theme === "light") return;

    document.body.classList.toggle("dark-mode", theme === "dark");
    localStorage.setItem("theme", theme);
    updateThemeToggleButtonText(); 
};

function updateThemeToggleButtonText () {
    if (!themeToggleButton) return;  
    const currentTheme = document.body.classList.contains("dark-mode") ? "dark" : "light";
    const translationKey = currentTheme === "dark" ? "settings.theme.toggle_light" : "settings.theme.toggle_dark";
    const fallbackText = currentTheme === "dark" ? "Toggle Light Mode" : "Toggle Dark Mode";
    themeToggleButton.textContent = translateCurrentLanguage(translationKey, fallbackText);
};

function applyPrimaryColor (color) {
    if(primaryColorPicker) primaryColorPicker.value = color;
    document.documentElement.style.setProperty('--primary-accent-color', color);
    localStorage.setItem("primaryColor", color);
};

function applySecondaryColor (color) {
    if(secondaryColorPicker) secondaryColorPicker.value = color;
    document.documentElement.style.setProperty('--secondary-accent-color', color);
    document.documentElement.style.setProperty('--main-border-color', color); 
    localStorage.setItem("secondaryColor", color);
};

function applyButtonHoverColor (color) {
    if(buttonHoverColorPicker) buttonHoverColorPicker.value = color;
    document.documentElement.style.setProperty('--button-hover-background-color', color);
    localStorage.setItem("buttonHoverColor", color);
};

function applySavedThemeAndColors(){
    const savedTheme = localStorage.getItem("theme");
    // Obter os valores padrão das variáveis CSS caso não haja nada salvo
    const rootStyle = getComputedStyle(document.documentElement);
    const defaultPrimaryColor = rootStyle.getPropertyValue('--primary-accent-color').trim() || "#4A90E2";
    const defaultSecondaryColor = rootStyle.getPropertyValue('--secondary-accent-color').trim() || "#50E3C2";
    const defaultButtonHoverColor = rootStyle.getPropertyValue('--button-hover-background-color').trim() || "#D6EFFF";

    const primaryColorToApply = localStorage.getItem("primaryColor") || defaultPrimaryColor;
    const secondaryColorToApply = localStorage.getItem("secondaryColor") || defaultSecondaryColor;
    const buttonHoverColorToApply = localStorage.getItem("buttonHoverColor") || defaultButtonHoverColor;

    if (savedTheme) {
        applyTheme(savedTheme);
    } else {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            applyTheme("dark");
        } else {
            applyTheme("light"); 
        }
    }
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
        if (!localStorage.getItem("theme")) { 
            applyTheme(event.matches ? "dark" : "light");
        }
    });

    if (primaryColorPicker) { 
        primaryColorPicker.value = primaryColorToApply;
        applyPrimaryColor(primaryColorToApply);     
    }
    if (secondaryColorPicker) {
        secondaryColorPicker.value = secondaryColorToApply;
        applySecondaryColor(secondaryColorToApply);
    }
    if (buttonHoverColorPicker) {
        buttonHoverColorPicker.value = buttonHoverColorToApply;
        applyButtonHoverColor(buttonHoverColorToApply);
    }
    updateThemeToggleButtonText(); 
}


document.addEventListener("DOMContentLoaded", initializePage);

window.addEventListener("load", async () => {
	if(location.search == "?generateEnglishTranslations") {
		await translatePage("en_US", true);
	}
    // applySavedThemeAndColors é chamado no final de initializePage agora, após o carregamento dos idiomas.
});

async function handleInputFiles(files) {
	let {
		"mcstructure": structureFiles = [],
		"mcworld": worldFiles = [],
		"zip": zipFiles = [],
		"mcpack": resourcePackFiles = []
	} = groupByFileExtension(files);
	let allWorldFiles = [...worldFiles, ...zipFiles];
	
	if (structureFilesList && structureFiles.length > 0) addFilesToFileInput(structureFilesList, structureFiles);
    if (worldFileInput && allWorldFiles.length > 0) setFileInputFiles(worldFileInput, allWorldFiles.slice(0, 1));
    if (oldPackInput && resourcePackFiles.length > 0) setFileInputFiles(oldPackInput, resourcePackFiles.slice(0, 1));
}

function updatePackNameInputPlaceholder() {
    if (packNameInput && structureFilesList) {
	    packNameInput.setAttribute("placeholder", HoloPrint.getDefaultPackName([...structureFilesList.files]));
    }
}

async function updateTexturePreview() {
    if (!generatePackForm || 
        !generatePackForm.elements.namedItem("textureOutlineWidth") ||
        !generatePackForm.elements.namedItem("textureOutlineColor") ||
        !generatePackForm.elements.namedItem("textureOutlineOpacity") ||
        !generatePackForm.elements.namedItem("tintColor") ||
        !generatePackForm.elements.namedItem("tintOpacity") ||
        !texturePreviewImageCont) {
        return;
    }
	texturePreviewImage ??= await defaultResourcePackStackPromise.then(rps => rps.fetchResource(`textures/blocks/${random(["crafting_table_front", "diamond_ore", "blast_furnace_front_off", "brick", "cherry_planks", "chiseled_copper", "cobblestone", "wool_colored_white", "stonebrick", "stone_granite_smooth"])}.png`)).then(res => res.toImage()).catch(err => {
        console.error("Failed to load texture preview image:", err);
        return null;
    });
	
    if (!texturePreviewImage) return;

	let can = new OffscreenCanvas(texturePreviewImage.width, texturePreviewImage.height);
	let ctx = can.getContext("2d");
	ctx.drawImage(texturePreviewImage, 0, 0);
	let textureOutlineWidth = +generatePackForm.elements.namedItem("textureOutlineWidth").value;
	let outlinedCan = textureOutlineWidth > 0? TextureAtlas.addTextureOutlines(can, [{
		x: 0,
		y: 0,
		w: can.width,
		h: can.height
	}], HoloPrint.addDefaultConfig({
		TEXTURE_OUTLINE_COLOR: generatePackForm.elements.namedItem("textureOutlineColor").value,
		TEXTURE_OUTLINE_OPACITY: parseFloat(generatePackForm.elements.namedItem("textureOutlineOpacity").value) / 100,
		TEXTURE_OUTLINE_WIDTH: textureOutlineWidth
	})) : can;
	let tintlessImage = await outlinedCan.convertToBlob().then(blob => blob.toImage());
	let outlinedCanCtx = outlinedCan.getContext("2d");
	outlinedCanCtx.fillStyle = generatePackForm.elements.namedItem("tintColor").value;
	outlinedCanCtx.globalAlpha = parseFloat(generatePackForm.elements.namedItem("tintOpacity").value) / 100;
	outlinedCanCtx.fillRect(0, 0, outlinedCan.width, outlinedCan.height);
	let tintedImage = await outlinedCan.convertToBlob().then(blob => blob.toImage());
	texturePreviewImageCont.textContent = "";
	texturePreviewImageCont.appendChild(tintlessImage);
	texturePreviewImageCont.appendChild(tintedImage);
}

async function translatePage(language, generateTranslations = false) {
    if (languageIsLoading && !generateTranslations) {
        return;
    }
    languageIsLoading = true;

    let translatableEls = [];
    try {
        translatableEls = [...document.documentElement.querySelectorAll('[data-translate], [data-translate-title], [data-translate-placeholder]')];
        document.querySelectorAll('*').forEach(el => {
            if (el.shadowRoot) {
                translatableEls.push(...el.shadowRoot.querySelectorAll('[data-translate], [data-translate-title], [data-translate-placeholder]'));
            }
        });
        translatableEls = [...new Set(translatableEls)];
    } catch (e) {
        console.error("Error selecting translatable elements:", e);
        languageIsLoading = false;
        return;
    }

	try {
        await loadTranslationLanguage(language);
    } catch (e) {
        console.error(`Failed to load language file for ${language}:`, e);
        languageIsLoading = false;
        if (language !== "en_US" && !generateTranslations) {
            console.warn("Attempting to load English as fallback.");
            await translatePage("en_US", generateTranslations); 
        } else if (generateTranslations) {
            console.error("Cannot generate translations if base language file fails to load.");
        }
        return;
    }

	let translations = {};
    if (generateTranslations) {
        try {
            const response = await fetch(`translations/${language}.json`);
            if(response.ok) translations = await response.jsonc();
        } catch (e) { /* Ignora se não existir */ }
    }
	
    for (const el of translatableEls) {
		const translationDataAttributes = Object.keys(el.dataset || {}).filter(key => key.startsWith('translate'));

        for (const attr of translationDataAttributes) {
            if (!el.dataset[attr]) continue;
            const translationKey = el.dataset[attr];
            const targetAttribute = attr === 'translate' ? 'innerHTML' : attr.substring('translate'.length).toLowerCase();
            
            if(generateTranslations) {
                let currentValue = "";
                if (targetAttribute === 'innerhtml') {
                    currentValue = el.innerHTML.replaceAll("<code>", "`").replaceAll("</code>", "`").replaceAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g, "[$2]($1)");
                } else {
                    currentValue = el.getAttribute(targetAttribute) || "";
                }
                if (!translations[translationKey] || translations[translationKey] !== currentValue) {
                    translations[translationKey] = currentValue;
                }
			} else {
				let translation = translate(translationKey, language); 
				if(translation !== undefined) {
                    const substitutedTranslation = performTranslationSubstitutions(el, translation);
                    if (targetAttribute === 'innerhtml') {
                        el.innerHTML = substitutedTranslation;
                    } else {
                        el.setAttribute(targetAttribute, substitutedTranslation);
                    }
				} else {
                    // Reduzido o log para apenas uma vez se initialTranslationsApplied for falso
                    if (!initialTranslationsApplied) {
                        // console.warn(`Key: "${translationKey}" in lang: ${language} missing.`);
                    }
                    let fallbackText = translationKey; 
                    if (targetAttribute === 'innerhtml' && (el.innerHTML === "" || el.innerHTML === "..." || el.innerHTML === translationKey)) {
                        let englishTranslation = translate(translationKey, "en_US");
						if(englishTranslation) fallbackText = performTranslationSubstitutions(el, englishTranslation);
                        el.innerHTML = fallbackText;
                    } else if (targetAttribute !== 'innerhtml' && (!el.hasAttribute(targetAttribute) || el.getAttribute(targetAttribute) === "" || el.getAttribute(targetAttribute) === translationKey)) {
                        let englishTranslation = translate(translationKey, "en_US");
                        if(englishTranslation) fallbackText = performTranslationSubstitutions(el, englishTranslation);
                        el.setAttribute(targetAttribute, fallbackText);
                    }
				}
			}
        }
        if (!generateTranslations && el.innerHTML && el.innerHTML.includes('{')) { 
             let currentHTML = el.innerHTML;
             let newHTML = performTranslationSubstitutions(el, currentHTML);
             if (currentHTML !== newHTML) {
                 el.innerHTML = newHTML;
             }
        }
	}

	if(generateTranslations) {
		translations = Object.fromEntries(Object.entries(translations).sort((a, b) => a[0].localeCompare(b[0])));
		downloadBlob(new File([JSON.stringify(translations, null, "\t")], `${language}.json`));
	}

    if (typeof updateThemeToggleButtonText === 'function') {
        updateThemeToggleButtonText();
    }
    if (!generateTranslations) initialTranslationsApplied = true;
    languageIsLoading = false;
}

function performTranslationSubstitutions(el, translation) {
	const prefix = "translationSub";
	Object.keys(el.dataset).forEach(key => {
		if(key.startsWith(prefix)) {
			let subName = key.substring(prefix.length);
            let snakeCasePlaceholder = subName.replace(/[A-Z]/g, (letter, index) => (index === 0 ? letter : `_${letter}`)).toUpperCase();
            let camelCasePlaceholder = subName.charAt(0).toLowerCase() + subName.slice(1);

            const value = el.dataset[key];
			translation = translation.replaceAll(`{${snakeCasePlaceholder}}`, value);
			translation = translation.replaceAll(`{${camelCasePlaceholder}}`, value);

			if (/^\d+$/.test(value)) {
                const numValue = parseInt(value, 10);
                const pluralRegexSnake = new RegExp(`\\{${snakeCasePlaceholder}\\s*\\[\\s*([^|\\]]+?)\\s*\\|\\s*([^|\\]]+?)\\s*\\]\\}`, "g");
                translation = translation.replace(pluralRegexSnake, (match, singular, plural) => (numValue === 1 ? singular : plural));
                
                const pluralRegexCamel = new RegExp(`\\{${camelCasePlaceholder}\\s*\\[\\s*([^|\\]]+?)\\s*\\|\\s*([^|\\]]+?)\\s*\\]\\}`, "g");
                 translation = translation.replace(pluralRegexCamel, (match, singular, plural) => (numValue === 1 ? singular : plural));
                
                 if (numValue === 1) {
                    translation = translation.replace(/\[s\]/g, "").replace(/\[es\]/g, "");
                } else {
                    translation = translation.replace(/\[s\]/g, "s").replace(/\[es\]/g, "es");
                }
                translation = translation.replace(/\[[^\]]+\]/g, ""); 
			}
		}
	});
	return translation;
}

function translateCurrentLanguage(translationKey, fallbackString = null) {
    let currentLang = "en_US"; 
    if(languageSelector && languageSelector.value && languageSelector.value !== "") {
        currentLang = languageSelector.value;
    }

	let translation = translate(translationKey, currentLang);
	if(translation === undefined) {
		translation = translate(translationKey, "en_US");
		if(translation === undefined) {
			translation = fallbackString ?? translationKey;
		}
	}
	return translation;
}

async function temporarilyChangeText(el, translationKey, duration = 2000) {
    if (!el) return;
	let originalTextContent = el.textContent;
    let originalDatasetTranslate = el.dataset.translate;

	el.dataset.translate = translationKey;
    if (languageSelector?.value) await translatePage(languageSelector.value); 
	
    el.setAttribute("disabled", "");
	await sleep(duration);

    if (originalDatasetTranslate) {
	    el.dataset.translate = originalDatasetTranslate;
        if (languageSelector?.value) await translatePage(languageSelector.value);
    } else {
        el.removeAttribute("data-translate");
        el.textContent = originalTextContent;
    }
	el.removeAttribute("disabled");
}

function validateFileInputFileTypes(fileInput) {
    if (!fileInput || !fileInput.accept) return true;
	let acceptableFileExtensions = fileInput.accept.split(",").map(ext => ext.trim().toLowerCase());
	let valid = Array.from(fileInput.files).every(file => {
        const fileNameLower = file.name.toLowerCase();
        return acceptableFileExtensions.some(fileExtension => fileNameLower.endsWith(fileExtension));
    });
	if(valid) {
		fileInput.setCustomValidity("");
	} else {
        const langValue = languageSelector?.value || "en_US";
        const translatedError = translateCurrentLanguage("upload.error.wrong_file_type", "Please upload only {FILE_TYPE} files.");
		fileInput.setCustomValidity(
            translatedError.replace("{FILE_TYPE}", joinOr(acceptableFileExtensions, langValue))
        );
	}
	return valid;
}

async function makePackAndHandleUI(structureFiles, configObject, resourcePackStackInstance) {
    if (!generatePackFormSubmitButton || !completedPacksCont) return;
    generatePackFormSubmitButton.disabled = true;

    if (IN_PRODUCTION && supabaseLogger) {
        console.debug("User agent:", navigator.userAgent);
    }

    // Limpar resultados anteriores
    while (completedPacksCont.firstChild) {
        completedPacksCont.removeChild(completedPacksCont.firstChild);
    }
    const progressBarContainer = document.getElementById('customProgressBarContainer'); // Seu ID
    const progressBar = document.getElementById('customProgressBar');
    if (progressBarContainer) progressBarContainer.classList.add('hidden'); // Esconde a barra


    let previewCont = document.createElement("div");
    previewCont.classList.add("previewCont");
    // Não adiciona previewCont ainda, HoloPrint.makePack decide.

    let infoButton = document.createElement("button");
    infoButton.classList.add("packInfoButton");
    infoButton.dataset.translate = "progress.generating";
    completedPacksCont.appendChild(infoButton); // Adiciona o botão de progresso
    
    if (languageSelector?.value && initialTranslationsApplied) { // Garante que as traduções possam ser aplicadas
         await translatePage(languageSelector.value);
    }
    if (progressBarContainer) progressBarContainer.classList.remove('hidden'); // Mostra barra


    if (logger) logger.setOriginTime(performance.now());

    let pack;
    let generationFailedError;
    try {
        pack = await HoloPrint.makePack(structureFiles, configObject, resourcePackStackInstance, previewCont); // previewCont é passado
    } catch (e) {
        console.error(`Pack creation failed!`, e); 
        if (!(e instanceof UserError)) {
            generationFailedError = e;
        }
    }
    
    if (progressBarContainer) progressBarContainer.classList.add('hidden'); // Esconde a barra após a geração

    infoButton.classList.add("finished"); 

    if (pack) {
        // Se HoloPrint.makePack adicionou conteúdo ao previewCont, ele já estará no DOM via completedPacksCont.
        // Se não, e previewCont está vazio, podemos removê-lo (opcional)
        if (previewCont.childNodes.length === 0 && previewCont.parentNode === completedPacksCont) {
            completedPacksCont.removeChild(previewCont);
        } else if (previewCont.childNodes.length > 0 && previewCont.parentNode !== completedPacksCont) {
            // Se makePack populou mas não adicionou, adicionamos aqui
            completedPacksCont.appendChild(previewCont);
        }


        infoButton.dataset.translate = "download";
        if (languageSelector?.value) await translatePage(languageSelector.value);
        infoButton.classList.add("completed");
        let hasLoggedPackCreation = false;
        infoButton.onclick = () => {
            if (!hasLoggedPackCreation && IN_PRODUCTION && supabaseLogger) {
                supabaseLogger.recordPackCreation(structureFiles);
                hasLoggedPackCreation = true;
            }
            downloadBlob(pack, pack.name);
        };
    } else {
        if (previewCont.parentNode === completedPacksCont) { // Remove o contêiner de preview se a geração falhar
             completedPacksCont.removeChild(previewCont);
        }

        infoButton.classList.remove("completed"); 
        if (generationFailedError) {
            let bugReportAnchor = document.createElement("a");
            bugReportAnchor.classList.add("buttonlike", "packInfoButton", "reportIssue", "finished");
            const logsForReport = selectEl("simple-logger")?.allLogs ?? [];
            bugReportAnchor.href = `https://github.com/Guihjzzz/HoloLab/issues/new?template=1-pack-creation-error.yml&title=Pack creation error: ${encodeURIComponent(generationFailedError.toString().replaceAll("\n", " "))}&version=${HoloPrint.VERSION}&logs=${encodeURIComponent(JSON.stringify(logsForReport))}`; // URL do SEU REPOSITÓRIO
            bugReportAnchor.target = "_blank";
            bugReportAnchor.dataset.translate = "pack_generation_failed.report_github_issue";
            
            if (infoButton.parentNode) {
                infoButton.parentNode.replaceChild(bugReportAnchor, infoButton);
            } else {
                 completedPacksCont.appendChild(bugReportAnchor); // Append em vez de prepend
                 if(infoButton) infoButton.remove(); 
            }
            if (languageSelector?.value) await translatePage(languageSelector.value);
        } else {
            infoButton.classList.add("failed");
            infoButton.dataset.translate = "pack_generation_failed";
             if (languageSelector?.value) await translatePage(languageSelector.value);
        }
    }
    generatePackFormSubmitButton.disabled = false;
}
