/**
 * Pictools - Typecho 图片上传前简易编辑器
 */
window.Pictools = (function () {
    'use strict';

    var modal = null;
    var originalFile = null;
    var uploadCallback = null;
    var pendingQueue = [];
    var isEditing = false;
    var image = new Image();
    var sourceCanvas = null;
    var previewCanvas = null;
    var previewCtx = null;

    var crop = {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        active: false,
        drawing: false,
        startX: 0,
        startY: 0
    };

    var displayScale = 1;
    var MAX_PREVIEW_WIDTH = 600;
    var MAX_PREVIEW_HEIGHT = 420;

    var elements = {};

    /**
     * 判断文件是否为图片
     */
    function isImage(file) {
        return !!(file && file.type && file.type.indexOf('image/') === 0);
    }

    /**
     * 创建编辑器 DOM
     */
    function ensureModal() {
        if (modal && modal.parentNode) {
            return;
        }

        modal = document.getElementById('pictools-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'pictools-modal';
            modal.className = 'pictools-modal hidden';
            document.body.appendChild(modal);
        }

        modal.innerHTML =
            '<div class="pictools-box">' +
                '<div class="pictools-header">' +
                    '<h3>图片编辑</h3>' +
                    '<span class="pictools-hint">拖拽鼠标框选裁剪区域</span>' +
                '</div>' +
                '<div class="pictools-toolbar">' +
                    '<div class="pictools-group pictools-toolbar-item">' +
                        '<label for="pictools-scale">缩放比例 (%)</label>' +
                        '<input type="number" id="pictools-scale" value="100" min="1" max="200" step="1" />' +
                        '<p class="pictools-hint">100% 为原图尺寸</p>' +
                    '</div>' +
                    '<div class="pictools-group pictools-toolbar-item">' +
                        '<label for="pictools-format">输出格式</label>' +
                        '<select id="pictools-format">' +
                            '<option value="original">原始格式</option>' +
                            '<option value="image/jpeg">JPEG</option>' +
                            '<option value="image/png">PNG</option>' +
                            '<option value="image/webp">WebP</option>' +
                        '</select>' +
                    '</div>' +
                '</div>' +
                '<div class="pictools-body">' +
                    '<div class="pictools-canvas-wrap">' +
                        '<canvas id="pictools-preview"></canvas>' +
                    '</div>' +
                    '<div class="pictools-sidebar">' +
                        '<div class="pictools-group">' +
                            '<label>裁剪</label>' +
                            '<div class="pictools-crop-actions">' +
                                '<button type="button" class="btn-xs" id="pictools-reset-crop">重置裁剪</button>' +
                            '</div>' +
                        '</div>' +
                        '<div class="pictools-group pictools-preview-group">' +
                            '<label>输出预览</label>' +
                            '<div class="pictools-preview" id="pictools-output-preview"></div>' +
                        '</div>' +
                        '<div class="pictools-group">' +
                            '<div class="pictools-info" id="pictools-info"></div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="pictools-footer">' +
                    '<button type="button" class="btn" id="pictools-cancel">取消</button>' +
                    '<button type="button" class="btn btn-primary" id="pictools-confirm">确定并上传</button>' +
                '</div>' +
            '</div>';

        elements.previewCanvas = document.getElementById('pictools-preview');
        previewCanvas = elements.previewCanvas;
        previewCtx = previewCanvas.getContext('2d');
        elements.scaleInput = document.getElementById('pictools-scale');
        elements.formatSelect = document.getElementById('pictools-format');
        elements.resetCropBtn = document.getElementById('pictools-reset-crop');
        elements.outputPreview = document.getElementById('pictools-output-preview');
        elements.info = document.getElementById('pictools-info');
        elements.confirmBtn = document.getElementById('pictools-confirm');
        elements.cancelBtn = document.getElementById('pictools-cancel');

        bindEvents();
    }

    /**
     * 绑定交互事件
     */
    function bindEvents() {
        elements.scaleInput.addEventListener('input', function () {
            renderOutputPreview();
        });

        elements.formatSelect.addEventListener('change', function () {
            renderOutputPreview();
        });

        elements.resetCropBtn.addEventListener('click', function () {
            resetCrop();
            renderPreview();
            renderOutputPreview();
        });

        elements.confirmBtn.addEventListener('click', function () {
            doUpload();
        });

        elements.cancelBtn.addEventListener('click', function () {
            close();
        });

        // 键盘 ESC 关闭弹窗
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
                close();
            }
        });

        // 画布裁剪事件
        previewCanvas.addEventListener('mousedown', onMouseDown);
        previewCanvas.addEventListener('mousemove', onMouseMove);
        previewCanvas.addEventListener('mouseup', onMouseUp);
        previewCanvas.addEventListener('mouseleave', onMouseUp);

        // 触摸支持
        previewCanvas.addEventListener('touchstart', onTouchStart, { passive: false });
        previewCanvas.addEventListener('touchmove', onTouchMove, { passive: false });
        previewCanvas.addEventListener('touchend', onMouseUp);
    }

    /**
     * 获取鼠标/触摸在画布上的坐标
     */
    function getCanvasPos(e) {
        var rect = previewCanvas.getBoundingClientRect();
        var clientX = e.clientX;
        var clientY = e.clientY;
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        }
        return {
            x: (clientX - rect.left) * (previewCanvas.width / rect.width),
            y: (clientY - rect.top) * (previewCanvas.height / rect.height)
        };
    }

    function onMouseDown(e) {
        e.preventDefault();
        var pos = getCanvasPos(e);
        crop.drawing = true;
        crop.active = false;
        crop.startX = pos.x;
        crop.startY = pos.y;
        crop.x = pos.x;
        crop.y = pos.y;
        crop.width = 0;
        crop.height = 0;
    }

    function onMouseMove(e) {
        if (!crop.drawing) {
            return;
        }
        e.preventDefault();
        var pos = getCanvasPos(e);
        crop.x = Math.min(pos.x, crop.startX);
        crop.y = Math.min(pos.y, crop.startY);
        crop.width = Math.abs(pos.x - crop.startX);
        crop.height = Math.abs(pos.y - crop.startY);
        renderPreview();
    }

    function onMouseUp(e) {
        if (!crop.drawing) {
            return;
        }
        crop.drawing = false;
        crop.active = crop.width > 5 && crop.height > 5;
        renderPreview();
        renderOutputPreview();
    }

    function onTouchStart(e) {
        if (e.touches.length === 1) {
            onMouseDown(e);
        }
    }

    function onTouchMove(e) {
        if (crop.drawing) {
            onMouseMove(e);
        }
    }

    /**
     * 重置裁剪
     */
    function resetCrop() {
        crop.x = 0;
        crop.y = 0;
        crop.width = 0;
        crop.height = 0;
        crop.active = false;
        crop.drawing = false;
    }

    /**
     * 打开编辑器（如果已有弹窗则加入队列）
     */
    function edit(file, callback) {
        if (!file) {
            return;
        }

        if (isEditing) {
            pendingQueue.push({ file: file, callback: callback });
            return;
        }

        isEditing = true;
        originalFile = file;
        uploadCallback = callback;

        ensureModal();

        var reader = new FileReader();
        reader.onload = function (e) {
            image.src = e.target.result;
        };
        reader.readAsDataURL(file);

        image.onload = function () {
            resetCrop();
            elements.scaleInput.value = 100;
            elements.formatSelect.value = 'original';
            renderPreview();
            renderOutputPreview();
            modal.classList.remove('hidden');
        };

        image.onerror = function () {
            if (typeof uploadCallback === 'function') {
                uploadCallback(file);
            }
            processQueue();
        };
    }

    /**
     * 处理待编辑队列中的下一个文件
     */
    function processQueue() {
        isEditing = false;
        if (pendingQueue.length === 0) {
            return;
        }
        var next = pendingQueue.shift();
        edit(next.file, next.callback);
    }

    /**
     * 在预览画布上绘制原图和裁剪框
     */
    function renderPreview() {
        if (!image.width) {
            return;
        }

        var scaleX = MAX_PREVIEW_WIDTH / image.width;
        var scaleY = MAX_PREVIEW_HEIGHT / image.height;
        displayScale = Math.min(scaleX, scaleY, 1);

        previewCanvas.width = Math.round(image.width * displayScale);
        previewCanvas.height = Math.round(image.height * displayScale);

        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        previewCtx.drawImage(image, 0, 0, previewCanvas.width, previewCanvas.height);

        if (crop.active || crop.drawing) {
            drawCropOverlay();
        }
    }

    /**
     * 绘制裁剪框遮罩
     */
    function drawCropOverlay() {
        previewCtx.save();
        previewCtx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);

        previewCtx.beginPath();
        previewCtx.rect(crop.x, crop.y, crop.width, crop.height);
        previewCtx.clip();
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        previewCtx.drawImage(image, 0, 0, previewCanvas.width, previewCanvas.height);

        previewCtx.strokeStyle = '#fff';
        previewCtx.lineWidth = 1;
        previewCtx.strokeRect(crop.x, crop.y, crop.width, crop.height);

        // 画九宫格辅助线
        previewCtx.beginPath();
        previewCtx.moveTo(crop.x + crop.width / 3, crop.y);
        previewCtx.lineTo(crop.x + crop.width / 3, crop.y + crop.height);
        previewCtx.moveTo(crop.x + crop.width * 2 / 3, crop.y);
        previewCtx.lineTo(crop.x + crop.width * 2 / 3, crop.y + crop.height);
        previewCtx.moveTo(crop.x, crop.y + crop.height / 3);
        previewCtx.lineTo(crop.x + crop.width, crop.y + crop.height / 3);
        previewCtx.moveTo(crop.x, crop.y + crop.height * 2 / 3);
        previewCtx.lineTo(crop.x + crop.width, crop.y + crop.height * 2 / 3);
        previewCtx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        previewCtx.stroke();

        previewCtx.restore();
    }

    /**
     * 渲染输出预览
     */
    function renderOutputPreview() {
        if (!image.width) {
            return;
        }

        var outputCanvas = document.createElement('canvas');
        var ctx = outputCanvas.getContext('2d');
        var size = getOutputSize();

        outputCanvas.width = size.width;
        outputCanvas.height = size.height;

        var sx = 0, sy = 0, sWidth = image.width, sHeight = image.height;
        if (crop.active) {
            sx = Math.round(crop.x / displayScale);
            sy = Math.round(crop.y / displayScale);
            sWidth = Math.round(crop.width / displayScale);
            sHeight = Math.round(crop.height / displayScale);
        }

        ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, size.width, size.height);

        elements.outputPreview.innerHTML = '';
        elements.outputPreview.appendChild(outputCanvas);

        updateInfo(size);
    }

    /**
     * 计算最终输出尺寸
     */
    function getOutputSize() {
        var sx = 0, sy = 0, sWidth = image.width, sHeight = image.height;
        if (crop.active) {
            sx = Math.round(crop.x / displayScale);
            sy = Math.round(crop.y / displayScale);
            sWidth = Math.round(crop.width / displayScale);
            sHeight = Math.round(crop.height / displayScale);
        }

        var scale = parseInt(elements.scaleInput.value, 10) || 100;
        scale = Math.max(1, Math.min(200, scale));

        return {
            width: Math.max(1, Math.round(sWidth * scale / 100)),
            height: Math.max(1, Math.round(sHeight * scale / 100))
        };
    }

    /**
     * 更新尺寸信息
     */
    function updateInfo(size) {
        var format = elements.formatSelect.value;
        if (format === 'original') {
            format = getOriginalMime() || 'image/png';
        }
        var formatName = format.replace('image/', '').toUpperCase();
        elements.info.innerHTML = '原图：' + image.width + ' × ' + image.height +
            '<br>输出：' + size.width + ' × ' + size.height +
            '<br>格式：' + formatName;
    }

    /**
     * 获取原始图片的 MIME 类型
     */
    function getOriginalMime() {
        if (originalFile && originalFile.type) {
            return originalFile.type;
        }
        return image.src && image.src.indexOf('data:') === 0 ? image.src.split(',')[0].split(':')[1].split(';')[0] : null;
    }

    /**
     * 获取输出格式和扩展名
     */
    function getOutputFormat() {
        var format = elements.formatSelect.value;
        var originalMime = getOriginalMime();

        if (format === 'original') {
            format = originalMime || 'image/png';
        }

        var ext = 'png';
        switch (format) {
            case 'image/jpeg':
                ext = 'jpg';
                break;
            case 'image/png':
                ext = 'png';
                break;
            case 'image/webp':
                ext = 'webp';
                break;
            default:
                ext = originalMime ? mimeToExt(originalMime) : 'png';
                break;
        }

        return { mime: format, ext: ext };
    }

    /**
     * MIME 类型转扩展名
     */
    function mimeToExt(mime) {
        var map = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/gif': 'gif',
            'image/webp': 'webp',
            'image/bmp': 'bmp',
            'image/svg+xml': 'svg'
        };
        return map[mime] || 'png';
    }

    /**
     * 生成最终文件并上传
     */
    function doUpload() {
        if (!originalFile || typeof uploadCallback !== 'function') {
            close();
            return;
        }

        var size = getOutputSize();
        var format = getOutputFormat();
        var quality = (format.mime === 'image/jpeg' || format.mime === 'image/webp') ? 0.92 : undefined;

        var outputCanvas = document.createElement('canvas');
        outputCanvas.width = size.width;
        outputCanvas.height = size.height;
        var ctx = outputCanvas.getContext('2d');

        var sx = 0, sy = 0, sWidth = image.width, sHeight = image.height;
        if (crop.active) {
            sx = Math.round(crop.x / displayScale);
            sy = Math.round(crop.y / displayScale);
            sWidth = Math.round(crop.width / displayScale);
            sHeight = Math.round(crop.height / displayScale);
        }

        ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, size.width, size.height);

        outputCanvas.toBlob(function (blob) {
            if (!blob) {
                uploadCallback(originalFile);
                close();
                return;
            }

            var name = originalFile.name;
            var dot = name.lastIndexOf('.');
            if (dot > 0) {
                name = name.substring(0, dot) + '.' + format.ext;
            } else {
                name = name + '.' + format.ext;
            }

            var editedFile = new File([blob], name, {
                type: format.mime,
                lastModified: Date.now()
            });

            uploadCallback(editedFile);
            close();
        }, format.mime, quality);
    }

    /**
     * 关闭弹窗
     */
    function close() {
        if (modal) {
            modal.classList.add('hidden');
        }
        originalFile = null;
        uploadCallback = null;
        resetCrop();
        processQueue();
    }

    return {
        isImage: isImage,
        edit: edit
    };
})();
