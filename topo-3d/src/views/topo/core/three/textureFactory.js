/**
 * textureFactory - CanvasTexture 工厂
 *
 * 职责：
 *  - 生成设备屏幕贴图（电表液晶读数、PCS 运行面板），支持运行时增量重绘
 *  - 生成设备名称标签精灵（Sprite，始终朝向相机，保证等轴测视角下可读）
 *  - 生成地面文字节点贴图（对应第一版 text 节点）
 *
 * 说明：所有贴图均使用 CanvasTexture，不依赖任何外部图片资源；每条贴图自带
 * draw()/setText() 方法，业务层更新数据时只需重绘对应 canvas 并置 needsUpdate。
 */
import * as THREE from 'three';

/** 数字/仪表字体族 */
const FONT_FAMILY = "'IBM Plex Mono', 'SF Mono', Menlo, monospace";
/** 标题字体族 */
const DISPLAY_FONT = "'Chakra Petch', 'PingFang SC', sans-serif";

/**
 * 创建一张可复用的画布贴图对象。
 * @param {number} width 画布像素宽
 * @param {number} height 画布像素高
 * @returns {{canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, texture: THREE.CanvasTexture}}
 */
export function createCanvasTexture(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return { canvas, ctx, texture };
}

/**
 * 绘制圆角矩形路径。
 * @param {CanvasRenderingContext2D} ctx 画布上下文
 * @param {number} x 左上角 x
 * @param {number} y 左上角 y
 * @param {number} w 宽
 * @param {number} h 高
 * @param {number} r 圆角半径
 */
function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

/**
 * 创建设备名称标签精灵（Sprite 始终正对相机，保证等轴测视角下可读）。
 * 注意：字号与画布高度的比例（文字密度）需与 createBadgeSprite 保持一致（约 45%），
 * 否则 labelWorld/badgeWorld 两个常量无法用同一标尺理解。
 * @param {string} text 标签文本
 * @param {Object} [options] 可选配置
 * @param {number} [options.fontSize=58] 字号（画布像素，58/128 ≈ 徽章 44/96 的密度）
 * @param {string} [options.color='#29313d'] 文字颜色
 * @param {number} [options.worldHeight=18] 世界中高度（决定精灵缩放）
 * @returns {{sprite: THREE.Sprite, setText: Function, material: THREE.SpriteMaterial}}
 */
export function createLabelSprite(text, options = {}) {
    const fontSize = options.fontSize || 58;
    const color = options.color || '#29313d';
    const worldHeight = options.worldHeight || 18;
    const paddingX = 22;
    const paddingY = 12;
    const { canvas, ctx, texture } = createCanvasTexture(512, 128);
    const spriteMaterial = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        toneMapped: false
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.renderOrder = 20;
    // 标记为私有材质，随设备一起销毁
    spriteMaterial.userData.owned = true;

    /**
     * 重绘标签内容。
     * @param {string} value 新的文本
     */
    const setText = (value) => {
        const label = value == null ? '' : String(value);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!label) {
            texture.needsUpdate = true;
            sprite.visible = false;
            return;
        }
        sprite.visible = true;
        ctx.font = `600 ${fontSize}px ${DISPLAY_FONT}`;
        const textWidth = Math.min(ctx.measureText(label).width, canvas.width - paddingX * 2 - 8);
        const boxW = textWidth + paddingX * 2;
        const boxH = fontSize + paddingY * 2;
        const x = (canvas.width - boxW) / 2;
        const y = (canvas.height - boxH) / 2;
        // 药丸形底色
        roundRect(ctx, x, y, boxW, boxH, boxH / 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(176, 189, 205, 0.95)';
        ctx.stroke();
        // 文本
        ctx.font = `600 ${fontSize}px ${DISPLAY_FONT}`;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, canvas.width / 2, canvas.height / 2 + 2, canvas.width - paddingX * 2);
        texture.needsUpdate = true;
    };

    setText(text);
    // 按画布宽高比设置精灵缩放，保证文字不被拉伸
    sprite.userData.aspect = canvas.width / canvas.height;
    sprite.scale.set(worldHeight * sprite.userData.aspect, worldHeight, 1);
    return { sprite, setText, material: spriteMaterial };
}

/**
 * 创建电表 / PCS 液晶屏贴图。
 * @param {Object} [options] 可选配置
 * @param {string} [options.title=''] 顶部小标题
 * @param {string} [options.unit='kWh'] 单位
 * @returns {{material: THREE.MeshBasicMaterial, draw: Function, texture: THREE.CanvasTexture}}
 */
export function createScreenTexture(options = {}) {
    const { canvas, ctx, texture } = createCanvasTexture(256, 128);
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        toneMapped: false
    });
    material.userData.owned = true;

    /**
     * 重绘屏幕内容。
     * @param {Object} state 屏幕状态
     * @param {string} [state.title] 标题
     * @param {string|number} [state.value] 主读数
     * @param {string} [state.unit] 单位
     * @param {string} [state.status] 状态文本
     * @param {string} [state.color='#8ff0c8'] 主色
     */
    const draw = (state = {}) => {
        const title = state.title != null ? state.title : options.title || '';
        const value = state.value != null ? state.value : '--';
        const unit = state.unit != null ? state.unit : options.unit || '';
        const status = state.status || '';
        const color = state.color || '#8ff0c8';

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // 液晶底
        ctx.fillStyle = '#0e1a17';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = 'rgba(120, 200, 170, 0.35)';
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

        // 标题
        ctx.font = `500 22px ${FONT_FAMILY}`;
        ctx.fillStyle = 'rgba(146, 205, 180, 0.75)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(title, 14, 10);

        // 主读数（数码管风格）
        ctx.font = `600 54px ${FONT_FAMILY}`;
        ctx.fillStyle = color;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'alphabetic';
        const unitWidth = unit ? 44 : 0;
        ctx.fillText(String(value), canvas.width - 16 - unitWidth, 78);

        // 单位
        if (unit) {
            ctx.font = `500 22px ${FONT_FAMILY}`;
            ctx.fillStyle = 'rgba(146, 205, 180, 0.8)';
            ctx.textAlign = 'right';
            ctx.fillText(unit, canvas.width - 14, 78);
        }

        // 底部状态
        if (status) {
            ctx.font = `500 20px ${FONT_FAMILY}`;
            ctx.fillStyle = 'rgba(146, 205, 180, 0.6)';
            ctx.textAlign = 'left';
            ctx.fillText(status, 14, 106);
        }
        texture.needsUpdate = true;
    };

    draw();
    return { material, draw, texture };
}

/**
 * 创建数据徽章精灵（实时功率等数值，带彩色描边）。
 * @param {Object} [options] 可选配置
 * @param {number} [options.worldHeight=13] 世界中高度
 * @returns {{sprite: THREE.Sprite, setText: Function, setColor: Function, material: THREE.SpriteMaterial}}
 */
export function createBadgeSprite(options = {}) {
    const worldHeight = options.worldHeight || 13;
    const { canvas, ctx, texture } = createCanvasTexture(320, 96);
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        toneMapped: false
    });
    material.userData.owned = true;
    const sprite = new THREE.Sprite(material);
    sprite.renderOrder = 21;
    let currentText = '';
    let currentColor = '#00b189';

    /** 重绘徽章 */
    const redraw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!currentText) {
            sprite.visible = false;
            texture.needsUpdate = true;
            return;
        }
        sprite.visible = true;
        const fontSize = 44;
        ctx.font = `600 ${fontSize}px ${FONT_FAMILY}`;
        const textWidth = ctx.measureText(currentText).width;
        const boxW = Math.min(canvas.width - 8, textWidth + 44);
        const boxH = fontSize + 26;
        const x = (canvas.width - boxW) / 2;
        const y = (canvas.height - boxH) / 2;
        roundRect(ctx, x, y, boxW, boxH, boxH / 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = currentColor;
        ctx.stroke();
        ctx.font = `600 ${fontSize}px ${FONT_FAMILY}`;
        ctx.fillStyle = currentColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(currentText, canvas.width / 2, canvas.height / 2 + 2);
        texture.needsUpdate = true;
    };

    sprite.userData.aspect = canvas.width / canvas.height;
    sprite.scale.set(worldHeight * sprite.userData.aspect, worldHeight, 1);

    return {
        sprite,
        material,
        /**
         * 设置徽章文本与颜色。
         * @param {string} text 文本
         * @param {string} [color] 颜色
         */
        setText(text, color) {
            currentText = text == null ? '' : String(text);
            if (color) currentColor = color;
            redraw();
        },
        /**
         * 仅更新颜色。
         * @param {string} color 颜色
         */
        setColor(color) {
            currentColor = color;
            redraw();
        }
    };
}

/**
 * 创建地面文字贴图（对应第一版 text 节点）。
 * @param {string} text 文本内容
 * @param {Object} [options] 可选配置
 * @param {number} [options.fontSize=64] 字号
 * @param {string} [options.color='#2b3440'] 颜色
 * @returns {{material: THREE.MeshBasicMaterial, setText: Function, texture: THREE.CanvasTexture}}
 */
export function createTextPlaneTexture(text, options = {}) {
    const fontSize = options.fontSize || 64;
    const color = options.color || '#2b3440';
    const { canvas, ctx, texture } = createCanvasTexture(512, 128);
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide
    });
    material.userData.owned = true;

    /**
     * 重绘文字内容。
     * @param {string} value 文本
     */
    const setText = (value) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = `600 ${fontSize}px ${DISPLAY_FONT}`;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(value == null ? '' : String(value), canvas.width / 2, canvas.height / 2, canvas.width - 16);
        texture.needsUpdate = true;
    };

    setText(text);
    return { material, setText, texture };
}
