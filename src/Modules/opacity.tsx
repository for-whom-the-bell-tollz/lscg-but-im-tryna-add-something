import { h } from "tsx-dom";
import { BaseModule } from "base";
import { getModule } from "modules";
import { OpacitySettingsModel } from "Settings/Models/base";
import { ModuleCategory } from "Settings/setting_definitions";
import { LSCG_TEAL, hookFunction, isCloth, mouseTooltip } from "../utils";
import { StateModule } from "./states";
import { drawTooltip } from "Settings/settingUtils";
import { endsWith, kebabCase, replace } from "lodash-es";
import styles from "./opacity.scss";

interface OpacitySlider {
    ElementId: string;
    Value: number;
}

interface TranslationValue {
    layerName: string;
    xValue: number;
    yValue: number;
}

interface PropertiesWithLayerOverrides extends ItemProperties {
    LayerOverrides: any[];
}

const root = "lscg-layers";
const ID = Object.freeze({
    root,
    container: `${root}-container`,
    styles: `${root}-style`,
    exit: `${root}-exit`,
    mainToolbar: `${root}-toolbar`,
    allLayersCheck: `${root}-all-layers-check`,
    leadLined: `${root}-lead-lined-check`,
    translateCheck: `${root}-translate-check`,

    opacity: `${root}-opacity`,
    opacityMain: `${root}-opacity-main`,
    opacityLayers: `${root}-opacity-layers`,
    
    translate: `${root}-translate`,
    translateToolbar: `${root}-translate-toolbar`,
    translateButtons: `${root}-translate-buttons`,
    translateX: `${root}-translate-x`,
    translateY: `${root}-translate-y`
});

export class OpacityModule extends BaseModule {
    OpacityMainSlider: OpacitySlider = {
        ElementId: ID.opacityMain,
        Value: 100
    };
    OpacityLayerSliders: OpacitySlider[] = [];

    OpacityItem: Item | null = null;
    OpacityCharacter: OtherCharacter | null = null;
    get ShowAllOpacityLayers(): boolean {
        return (document.getElementById(ID.allLayersCheck) as HTMLInputElement)?.checked;
    };

    get TranslationMode(): boolean {
        return (document.getElementById(ID.translateCheck) as HTMLInputElement)?.checked;
    }
    TranslationButtons: TranslationValue[] = [];
    SelectedTranslationLayer: number = -1;
    TranslateXElementId: string = ID.translateX;// "LSCG_TranslateX";
    TranslateYElementId: string = ID.translateY;// "LSCG_TranslateY";
    TranslateXElement: HTMLInputElement | undefined;
    TranslateYElement: HTMLInputElement | undefined;
    lastX: number = 0;
    lastY: number = 0;

    domUI = Object.freeze({
        shape: [40, 80, 650, 740] as RectTuple,
        visibility: "visible",
        dom: <div id={ID.root} class="lscg-layers-root HideOnPopup">
            <style id={ID.styles}>{styles.toString()}</style>
            <div id={ID.mainToolbar}>
                    <label class="lscg-checkbox">
                        <input id={ID.allLayersCheck} type="checkbox" onChange={(evt) => this.onToggleAllLayers(evt)}/>
                        All Layers
                    </label>
                    <label class="lscg-checkbox">
                        <input id={ID.leadLined} type="checkbox" onChange={(evt) => this.onToggleLeadLined(evt)} checked={this.OpacityItem?.Property?.LSCGLeadLined}/>
                        Lead-Lined
                    </label>
                    <label class="lscg-checkbox">
                        <input id={ID.translateCheck} type="checkbox" onChange={(evt) => this.onToggleTranslate(evt)}/>
                        Translate
                    </label>
                </div>
            <div id={ID.container}>
                <div id={ID.opacity} class="lscg-layers-body">
                    <div id={ID.opacityMain}></div>
                    <div id={ID.opacityLayers} class="lscg-layers-listing scroll-box" style="display:none"></div>
                </div>
                <div id={ID.translate} class="lscg-layers-body" style="display:none">
                    <div id={ID.translateToolbar}>
                        <div class="lscg-translate-direction">
                            <input id={ID.translateX} type="number" />
                            <div>
                                <span onClick={() => this.minusX()}>⬅️</span> X <span onClick={() => this.plusX()}>➡️</span>
                            </div>
                        </div>
                        <div class="lscg-translate-direction">
                            <input id={ID.translateY} type="number" />
                            <div>
                                <span onClick={() => this.plusY()}>⬇️</span> Y <span onClick={() => this.minusY()}>⬆️</span>
                            </div>
                        </div>
                        <button type="button" onClick={() => this.ResetTranslation()} title="Reset"></button>
                    </div>
                    <div id={ID.translateButtons} class="lscg-layers-listing scroll-box"></div>
                </div>
            </div>
        </div>
    });

    get settings(): OpacitySettingsModel {
        return super.settings as OpacitySettingsModel;
	}

    get defaultSettings() {
        return {
            enabled: true,
            preventExternalMod: false
        } as OpacitySettingsModel;
    }

    CanChangeOpacityOnCharacter(C: OtherCharacter): boolean {
        return C.IsPlayer() || !(C.LSCG?.OpacityModule?.preventExternalMod ?? false);
    }

    ShowDomUI() {
        this.HideDomUI();
        document.body.appendChild(this.domUI.dom);

        this.PopulateLayers();
    }

    HideDomUI() {
        let domEle = document.getElementById(ID.root);
        if (!!domEle) {
            domEle.remove();
        }
    }

    ResizeDomUI(load: boolean) {
        // Different positions based on the width/height ratio
        const heightRatio = MainCanvas.canvas.clientHeight / 1000;
        const widthRatio = MainCanvas.canvas.clientWidth / 2000;
        
        const left = MainCanvas.canvas.offsetLeft + this.domUI.shape[0] * widthRatio;
        const top = MainCanvas.canvas.offsetTop + this.domUI.shape[1] * heightRatio;
        const width = this.domUI.shape[2] * widthRatio;
        const height = this.domUI.shape[3] * heightRatio;

        const style: Partial<CSSStyleDeclaration> = {
            left: `${left}px`,
            top: `${top}px`,
            width: `${width}px`,
            height: `${height}px`,
        };
        if (load) {
            style.fontFamily = CommonGetFontName();
            style.visibility = this.domUI.visibility;
        }

        const elem = document.getElementById(ID.root) as HTMLElement;
        if (!!elem)
            Object.assign(elem.style, style);
    }

    PopulateLayers() {
        if (!this.OpacityItem || !this.OpacityItem.Asset || !this.OpacityItem.Asset.Layer || !Array.isArray(this.OpacityItem.Asset.Layer))
            return;

        let layerCount = this.OpacityItem.Asset.Layer.length;

        document.getElementById(ID.opacityLayers)?.replaceChildren(...[]);
        document.getElementById(ID.translateButtons)?.replaceChildren(...[]);
        let leadLined = document.getElementById(ID.leadLined) as HTMLInputElement;
        if (!!leadLined)
            leadLined.checked = this.OpacityItem.Property?.LSCGLeadLined ?? false;

        let opacityRaw = this.getOpacity();
        let opacityValue = (Array.isArray(opacityRaw) ? (opacityRaw.length == 1 && opacityRaw.length != layerCount ? (opacityRaw[0] ?? 1) : 1) : (opacityRaw ?? 1)) * 100;
        let mainOpacitySlider = this.createOpacitySlider("Opacity %", ID.opacityMain + "-main", opacityValue, (evt) => this.onOpacityChange(evt));
        document.getElementById(ID.opacityMain)?.replaceChildren(mainOpacitySlider);
        this.OpacityMainSlider = {
            ElementId: ID.opacityMain + "-main",
            Value: opacityValue
        }
        this.OpacityLayerSliders = [];
        this.TranslationButtons = [];
        let opacityArr = new Array(this.OpacityItem.Asset.Layer.length);
        if (!Array.isArray(opacityRaw)) 
            opacityArr = opacityArr.fill((opacityRaw ?? 1));
        else if (opacityRaw.length == 1 && opacityRaw.length != layerCount)
            opacityArr = opacityArr.fill((opacityRaw[0] ?? 1));
        else
            opacityArr = opacityRaw;
            

        let translateAllButton = this.createTranslateButton("All Layers", (evt) => this.onClickTranslate(evt));
        translateAllButton.classList.add("selected");
        document.getElementById(ID.translateButtons)?.appendChild(translateAllButton);

        if (this.OpacityItem.Asset.Layer.length <= 1) {
            let allLayersCheck = document.getElementById(ID.allLayersCheck) as HTMLInputElement;
            if (!!allLayersCheck) {
                allLayersCheck.checked = false;
                this.onToggleAllLayers();
            }
        }

        this.OpacityItem.Asset.Layer.forEach((layer: AssetLayer, ix, arr) => {
            let layerName = layer.Name;
            if (!!layerName) {
                // Create and add layer dom elements
                let opacityVal = opacityArr[ix] * 100;

                let opacityId = ID.opacityLayers + "_" + kebabCase(layerName);
                let opacitySlider = this.createOpacitySlider(layerName, opacityId, opacityVal, (evt) => this.onOpacityChange(evt, layer));
                let translateButton = this.createTranslateButton(layerName, (evt) => this.onClickTranslate(evt, layer));
                
                document.getElementById(ID.opacityLayers)?.appendChild(opacitySlider);
                document.getElementById(ID.translateButtons)?.appendChild(translateButton);
                this.OpacityLayerSliders.push({
                    ElementId: opacityId,
                    Value: (layer.Opacity ?? 1) * 100
                } as OpacitySlider)
                this.TranslationButtons.push({
                    layerName: layerName,
                    xValue: layer.DrawingLeft[PoseType.DEFAULT],
                    yValue: layer.DrawingTop[PoseType.DEFAULT]
                } as TranslationValue);
            }
        });

        this.SelectedTranslationLayer = -1;
        this.SetTranslationElementValues()
    }

    createOpacitySlider(label: string | null, id: string, val: number, onChange: (evt: Event) => void) {
        return  <fieldset id={id} class="lscg-opacity-slider">
                    <legend>{label}</legend>
                    <div class="lscg-opacity-slider-inputs">
                        <input id={id + "_Range"} type="range" min="0" max="100" step="1" onInput={onChange} class="range-input" value={val}></input>
                        <input id={id + "_Number"} type="number" min="0" max="100" step="1" onInput={onChange} value={val}></input>
                    </div>
                </fieldset>
    }

    createTranslateButton(label: string | undefined, onClick: (evt: Event) => void) {
        return  <button class="lscg-button lscg-translate-button"
                        id={ID.translateButtons + "_" + kebabCase(label)}
                        onClick={onClick}>
                    {label}
                </button>
    }

    onOpacityChange(evt: Event, layer?: AssetLayer | undefined) {
        // If layer is undefined, consider it the main slider
        let input = evt.target as HTMLInputElement;
        let value = input.value;
        this._updateOpacityValue(input.id);
        if (endsWith(input.id, "_Range")) {
            let targetId = replace(input.id, "_Range", "_Number");
            let targetEle = document.getElementById(targetId) as HTMLInputElement;
            if (!!targetEle) targetEle.value = value;
        } else {
            let targetId = replace(input.id, "_Range", "_Number");
            let targetEle = document.getElementById(targetId) as HTMLInputElement;
            if (!!targetEle) targetEle.value = value;
        }
        if (!layer) {
            this.OpacityLayerSliders.forEach(s => {
                let rangeSlider = document.getElementById(s.ElementId + "_Range") as HTMLInputElement;
                let numericSlider = document.getElementById(s.ElementId + "_Number") as HTMLInputElement;
                if (!!rangeSlider) rangeSlider.value = value;
                if (!!numericSlider) numericSlider.value = value;
            });
        }
        this.UpdatePreview();
    }

    onToggleAllLayers(evt?: Event) {
        let main = document.getElementById(ID.opacityMain);
        let layers = document.getElementById(ID.opacityLayers);
        if (!main || !layers) return;

        if (this.ShowAllOpacityLayers) {
            main.style.display = "none";
            layers.style.display = "";
        } else {
            main.style.display = "";
            layers.style.display = "none";
        }
    }

    onToggleTranslate(evt?: Event) {
        console.info(evt);
        let opacity = document.getElementById(ID.opacity);
        let translate = document.getElementById(ID.translate);
        let allLayerCheck = document.getElementById(ID.allLayersCheck) as HTMLInputElement;

        if (!opacity || !translate || !allLayerCheck) return;

        if (this.TranslationMode) {
            opacity.style.display = "none";
            translate.style.display = "";
            allLayerCheck.disabled = true;
        } else {
            opacity.style.display = "";
            translate.style.display = "none";
            allLayerCheck.disabled = false;
        }
    }

    onToggleLeadLined(evt?: Event) {
        if (!this.OpacityItem)
            return;
        if (!this.OpacityItem.Property)
            this.OpacityItem.Property = {};
        this.OpacityItem.Property.LSCGLeadLined = (evt?.target as HTMLInputElement)?.checked ?? false;
    }

    onClickTranslate(evt: Event, layer?: AssetLayer) {
        if (!this.OpacityItem || !this.OpacityItem.Asset || !this.OpacityItem.Asset.Layer)
            return;

        let allButtons = document.getElementsByClassName("lscg-translate-button");
        if (!!allButtons) {
            Array.from(allButtons).forEach(b => b.classList.remove("selected"));
        }

        if (!layer)
            this.SelectedTranslationLayer = -1;
        else
            this.SelectedTranslationLayer = this.OpacityItem.Asset.Layer.indexOf(layer);

        (evt?.target as HTMLButtonElement).classList.add("selected");
        this.SetTranslationElementValues();
    }

    _prevResize: any;
    load(): void {
        hookFunction("ItemColorLoad", 1, (args, next) => {
            next(args);
            let C = args[0] as OtherCharacter;
            let Item = args[1] as Item;
            if (this.CanChangeOpacityOnCharacter(C) && isCloth(Item)) {
                this.OpacityCharacter = C;
                this.OpacityItem = Item;

                this.ShowDomUI();
                if (!CurrentScreenFunctions) {
                    CurrentScreenFunctions = {} as ScreenFunctions;
                }
                
                this._prevResize = CurrentScreenFunctions.Resize;
                CurrentScreenFunctions.Resize = (load) => this.ResizeDomUI(load);
                CurrentScreenFunctions.Resize(true);

                this.TranslateRemoveEventListener();
                this.TranslateAttachEventListener();
            }
        }, ModuleCategory.Opacity);

        hookFunction("ItemColorFireExit", 1, (args, next) => {
            next(args);
            this.OpacityCharacter = null;
            this.OpacityItem = null;
            this.HideDomUI();
            
            this.TranslateRemoveEventListener();
            CurrentScreenFunctions.Resize = this._prevResize;
        }, ModuleCategory.Opacity);
        
        // *** Hack in actual updating of the translation overrides ***
        hookFunction("CommonCallFunctionByNameWarn", 2, (args, next) => {
            let funcName = args[0];
            let params = args[1];
            if (!params) {
                return next(args);
            }
            let C = params['C'] as OtherCharacter;
            let CA = params['CA'] as Item;
            let groupName = params['GroupName'];
            let Property = params['Property'];
            let regex = /Assets(.+)BeforeDraw/i;
            if (regex.test(funcName)) {
                let ret = CommonCallFunctionByName(args[0], args[1]) ?? {};
                if (this.Enabled && !!CA && isCloth(CA) && !!Property) {
                    let layerName = (params['L'] as string ?? "").trim();
                    if (layerName[0] == '_')
                        layerName = layerName.slice(1);
                    let layerIx = CA.Asset.Layer.findIndex(l => l.Name == layerName);

                    let xOverride = Property?.LayerOverrides?.[layerIx]?.DrawingLeft?.[PoseType.DEFAULT] ?? undefined;
                    let yOverride = Property?.LayerOverrides?.[layerIx]?.DrawingTop?.[PoseType.DEFAULT] ?? undefined;

                    // Adjust for pose. BIGGER change would be to actually save the lscg translate as offsets instead of overrides... which... should be done but will suck >.<
                    if (!!xOverride || !!yOverride) {
                        for (const drawPose of C.DrawPose) {
                            const PoseDef = PoseRecord[drawPose];
                            if (PoseDef && PoseDef.MovePosition) {
                                const MovePosition = PoseDef.MovePosition.find(MP => MP.Group === groupName);
                                if (MovePosition) {
                                    if (!!xOverride) xOverride += MovePosition.X;
                                    if (!!yOverride) yOverride += MovePosition.Y;
                                }
                            }
                        }
                    }

                    if (!!xOverride) ret.X = xOverride;
                    if (!!yOverride) ret.Y = yOverride + CanvasUpperOverflow;
                }
                return ret
            } else
                return next(args);
        }, ModuleCategory.Opacity);
    }

    run() {
        hookFunction("CommonDrawAppearanceBuild", 1, (args, next) => {
            let C = args[0] as OtherCharacter;
            let callbacks = args[1];
            if (this.Enabled) {
                C.AppearanceLayers?.forEach((Layer) => {
                    const A = Layer.Asset;
                    if (isCloth(A)) {
                        (A as any).DynamicBeforeDraw = true;
                    }
                });
            }
            // Hack fix in case the body style was actually removed
            if (InventoryGet(C, "BodyStyle") == null) {
                InventoryWear(C, "Original", "BodyStyle");
            }
            return next(args);
        }, ModuleCategory.Opacity);

        hookFunction("CharacterAppearanceSortLayers", 1, (args, next) => {
            let C = args[0] as OtherCharacter;
            if (!C.MemberNumber || !this.Enabled)
                return next(args);

            let xray = getModule<StateModule>("StateModule")?.XRayState;
            let xrayActive = xray?.Active && xray?.CanViewXRay(C);
            C.DrawAppearance?.forEach(item => {
                let opacity = this.getOpacity(item)
                let hasOpacitySettings = opacity !== undefined && opacity != 1;
                if ((hasOpacitySettings || xrayActive) && !item.Property?.LSCGLeadLined) {
                    item.Asset = Object.assign({}, item.Asset);
                    (item.Asset as any).Layer = item.Asset.Layer.map(l => Object.assign({}, l));
                    item?.Asset?.Layer?.forEach(layer => {
                        (layer as any).Alpha = [];
                    });
                    (item.Asset as any).Hide = [];
                    (item.Asset as any).HideItem = [];
                    (item.Asset as any).HideItemAttribute = [];
                } else {
                    let defaultAsset = AssetMap.get(`${item?.Asset?.Group?.Name}/${item.Asset.Name}`);
                    if (!!defaultAsset) {
                        item.Asset = Object.assign({}, defaultAsset);
                        (item.Asset as any).Layer = defaultAsset.Layer.map(l => Object.assign({}, l));
                    }
                }

                if (item.Asset.Name == "Penis") {
                    let transpPants = !!this.getOpacity(InventoryGet(C, "ClothLower"));
                    let transpUnderwear = !!this.getOpacity(InventoryGet(C, "Panties"));
                    if ((xrayActive || transpPants || transpUnderwear) && (!item.Property || !item.Property?.OverridePriority)) {
                        if (!item.Property)
                            item.Property = {};
                        item.Property.OverridePriority = 18;
                    }
                }
            });
            return next(args);
        }, ModuleCategory.Opacity);
    }

    minusX() {
        ElementValue(this.TranslateXElementId, Math.round(parseFloat(ElementValue(this.TranslateXElementId))) - 10 + "");
        this._updateTranslationValue(this.TranslateXElementId);
        this.UpdatePreview();
    }

    minusY() {
        ElementValue(this.TranslateYElementId, Math.round(parseFloat(ElementValue(this.TranslateYElementId))) - 10 + "");
        this._updateTranslationValue(this.TranslateYElementId);
        this.UpdatePreview();
    }

    plusX() {
        ElementValue(this.TranslateXElementId, Math.round(parseFloat(ElementValue(this.TranslateXElementId))) + 10 + "");
        this._updateTranslationValue(this.TranslateXElementId);
        this.UpdatePreview();
    }

    plusY() {
        ElementValue(this.TranslateYElementId, Math.round(parseFloat(ElementValue(this.TranslateYElementId))) + 10 + "");
        this._updateTranslationValue(this.TranslateYElementId);
        this.UpdatePreview();
    }

    getOpacity(item?: Item | null): number | number[] | undefined {
        if (!item)
            item = this.OpacityItem;
        return this.getOpacityFromProperties(item?.Property);        
    }

    getOpacityFromProperties(props?: ItemProperties | null): number | number[] | undefined {
        if (!!props && !!props.LSCGOpacity)
            this.setOpacityInProperty(props, props.LSCGOpacity);
        return props?.Opacity ?? 1;
    }

    setOpacity(item: Item, value: number | number[]) {
        if (!item.Property)
            item.Property = {};
        this.setOpacityInProperty(item.Property, value);
    }

    setOpacityInProperty(props: ItemProperties, value: number | number[]) {
        props.Opacity = value;
        if (!!props.LSCGOpacity)
            delete props.LSCGOpacity;
    }

    isDragging: boolean = false;
    TranslateStart(evt: TouchEvent | MouseEvent) {
        if (isTouchEvent(evt) && evt.changedTouches) {
            if (evt.changedTouches.length > 1) return;
        }
        ColorPickerGetCoordinates(evt);      
        if (this.TranslationMode && MouseIn(700, 0, 500, 1000)) {
            this.isDragging = true;
            this.lastX = MouseX;
            this.lastY = MouseY;
        }
        let ui = document.getElementById(ID.root);
        if (!!ui) {
            ui.classList.add("lscg-translate-dragging");
        }
    }

    TranslateMove(evt: TouchEvent | MouseEvent) {
        if (!this.isDragging || !this.TranslationMode) return;
        if (isTouchEvent(evt) && evt.changedTouches) {
            if (evt.changedTouches.length > 1) return;
        }
        
        ColorPickerGetCoordinates(evt);
        let mX = Math.min(Math.max(MouseX, 700), 1200);
        let mY = Math.min(Math.max(MouseY, 0), 1000);
        let dX = mX - this.lastX;
        let dY = mY - this.lastY;
        let curX = Math.round(parseFloat(ElementValue(this.TranslateXElementId)));
        let curY = Math.round(parseFloat(ElementValue(this.TranslateYElementId)));
        ElementValue(this.TranslateXElementId, curX + dX + "");
        ElementValue(this.TranslateYElementId, curY + dY + "");
        this._updateTranslationValue(this.TranslateXElementId);
        this._updateTranslationValue(this.TranslateYElementId);
        this.lastX = mX;
        this.lastY = mY;
        this.UpdatePreview();
    }

    TranslateEnd(evt: TouchEvent | MouseEvent) {
        this.isDragging = false;
        let ui = document.getElementById(ID.root);
        if (!!ui) {
            ui.classList.remove("lscg-translate-dragging");
        }
    }

    OpacityChange(slider: OpacitySlider) {
        let value = Math.round(this._updateOpacityValue(slider.ElementId) * 100);
        slider.Value = value;
        document.getElementById(slider.ElementId + "_Text")?.setAttribute("value", value);
        this.UpdatePreview();
    }

    OpacityTextChange(slider: OpacitySlider) {
        let value = Math.round(this._updateOpacityValue(slider.ElementId + "_Text") * 100);
        slider.Value = value;
        document.getElementById(slider.ElementId)?.setAttribute("value", value);
        this.UpdatePreview();
    }

    TranslationTextChange(elementId: string) {
        let value = Math.round(this._updateTranslationValue(elementId));
        document.getElementById(elementId)?.setAttribute("value", value);
        this.UpdatePreview();
    }

    SetTranslationElementValues() {
        if (!this.OpacityItem)
            return;
        let asset = this.OpacityItem.Asset;
        let origAsset = Object.assign({}, AssetGet("Female3DCG", this.OpacityItem.Asset.Group.Name, this.OpacityItem.Asset.Name));
        if (!origAsset)
            origAsset = Object.assign({}, asset);
        let assetLayer = origAsset.Layer[Math.max(this.SelectedTranslationLayer, 0)];
        let layer: any = (this.OpacityItem?.Property as PropertiesWithLayerOverrides)?.LayerOverrides?.[Math.max(this.SelectedTranslationLayer, 0)] ?? undefined;
        if (!layer)
            layer = assetLayer;
        let x = (layer["DrawingLeft"] ? layer["DrawingLeft"][PoseType.DEFAULT] : assetLayer["DrawingLeft"][PoseType.DEFAULT]) ?? assetLayer["DrawingLeft"][PoseType.DEFAULT];
        let y = (layer["DrawingTop"] ? layer["DrawingTop"][PoseType.DEFAULT] : assetLayer["DrawingTop"][PoseType.DEFAULT]) ?? assetLayer["DrawingTop"][PoseType.DEFAULT];
        ElementValue(this.TranslateXElementId, x + "");
        ElementValue(this.TranslateYElementId, y + "");
    }

    _updateTranslationValue(fromElementId: string): number {
        if (!this.OpacityItem)
            return 0;
        let value = Math.round(parseFloat(ElementValue(fromElementId)));
        if (!this.OpacityItem.Property)
            this.OpacityItem.Property = {};
        let properties = (this.OpacityItem.Property as PropertiesWithLayerOverrides);
        let layerCount = this.OpacityItem.Asset.Layer.length;
        if (!properties.LayerOverrides || properties.LayerOverrides.length != layerCount) {
            let previous = Object.assign({}, properties.LayerOverrides);
            properties.LayerOverrides = [];
            for (var i = 0; i < layerCount; i++) {
                if (!!previous[i])
                    properties.LayerOverrides.push(previous[i]);
                else {
                    let defaultLayer = this.OpacityItem?.Asset.Layer[i];
                    properties.LayerOverrides.push({
                        DrawingLeft: defaultLayer.DrawingLeft,
                        DrawingTop: defaultLayer.DrawingTop
                    });
                }
            };
        }
        if (fromElementId == this.TranslateXElementId) {
            if (this.SelectedTranslationLayer < 0)
                properties.LayerOverrides.forEach(lo => lo.DrawingLeft = {"": value});
            else
                properties.LayerOverrides[this.SelectedTranslationLayer].DrawingLeft = {"": value};
        } else {
            if (this.SelectedTranslationLayer < 0)
                properties.LayerOverrides.forEach(lo => lo.DrawingTop = {"": value});
            else
                properties.LayerOverrides[this.SelectedTranslationLayer].DrawingTop = {"": value};
        }
        return value;
    }

    _updateOpacityValue(fromElementId: string): number {
        if (!this.OpacityItem)
            return 1;

        let value = Math.round(parseFloat(ElementValue(fromElementId))) / 100;
        let C = Player;
        if (!this.OpacityItem.Property)
            this.OpacityItem.Property = {};
        if (fromElementId == this.OpacityMainSlider.ElementId + "_Range" || fromElementId == this.OpacityMainSlider.ElementId + "_Number") {
            if (value < 1)
                this.setOpacity(this.OpacityItem, value);
            else {
                delete this.OpacityItem.Property.LSCGOpacity;
                delete this.OpacityItem.Property.Opacity;
            }
        } else {
            let opacityArr = this.getOpacity();
            if (!Array.isArray(opacityArr))
                opacityArr = [];
            let ix = this.OpacityLayerSliders.findIndex(s => s.ElementId + "_Range" == fromElementId || s.ElementId + "_Number" == fromElementId);
            opacityArr[ix] = value;
            this.setOpacity(this.OpacityItem, opacityArr);
        }

        return value;
    }

    UpdatePreview = CommonLimitFunction(() => {
        if (!!this.OpacityCharacter)
            CharacterLoadCanvas(this.OpacityCharacter);
    }, 10, 99);

    TranslateAttachEventListener() {
        let CanvasElement = document.getElementById("MainCanvas");
        if (!CanvasElement)
            return;
        if (!CommonIsMobile) {
            CanvasElement.addEventListener("mousedown", evt => this.TranslateStart(evt));
            CanvasElement.addEventListener("mouseup", evt => this.TranslateEnd(evt));
            CanvasElement.addEventListener("mousemove", evt => this.TranslateMove(evt));
        }
        CanvasElement.addEventListener("touchstart", evt => this.TranslateStart(evt));
        CanvasElement.addEventListener("touchend", evt => this.TranslateEnd(evt));
        CanvasElement.addEventListener("touchmove", evt => this.TranslateMove(evt));
    }
    
    TranslateRemoveEventListener() {
        let CanvasElement = document.getElementById("MainCanvas");
        if (!CanvasElement)
            return;
        CanvasElement.removeEventListener("mousedown", evt => this.TranslateStart(evt));
        CanvasElement.removeEventListener("touchstart", evt => this.TranslateStart(evt));
        CanvasElement.removeEventListener("mousemove", evt => this.TranslateMove(evt));
        CanvasElement.removeEventListener("touchmove", evt => this.TranslateMove(evt));
        CanvasElement.removeEventListener("mouseup", evt => this.TranslateEnd(evt));
        CanvasElement.removeEventListener("touchend", evt => this.TranslateEnd(evt));
    }
    
    ResetTranslation() {
        if (!this.OpacityItem || !this.OpacityItem.Property || !(this.OpacityItem.Property as PropertiesWithLayerOverrides).LayerOverrides)
            return;
        (this.OpacityItem.Property as PropertiesWithLayerOverrides).LayerOverrides?.forEach(layer => {
            layer.DrawingLeft = this.OpacityItem?.Asset.DrawingLeft;
            layer.DrawingTop = this.OpacityItem?.Asset.DrawingTop;
            this.SelectedTranslationLayer = -1;
        });
        this.SetTranslationElementValues();
        this.UpdatePreview();
    }
}