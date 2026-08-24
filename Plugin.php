<?php

namespace TypechoPlugin\Pictools;

use Typecho\Plugin\PluginInterface;
use Typecho\Widget\Helper\Form;
use Widget\Options;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * 图片上传前简易编辑器
 *
 * 在后台撰写文章页面为图片附件提供裁剪、缩放、格式转换功能。
 *
 * @package Pictools
 * @author HakureiRoy
 * @version 1.3.0
 * @link https://github.com/Royapagee
 */
class Plugin implements PluginInterface
{
    /**
     * 激活插件方法
     */
    public static function activate()
    {
        \Typecho\Plugin::factory('admin/write-post.php')->bottom = __CLASS__ . '::render';
    }

    /**
     * 禁用插件方法
     */
    public static function deactivate()
    {
    }

    /**
     * 获取插件配置面板
     *
     * @param Form $form
     */
    public static function config(Form $form)
    {
    }

    /**
     * 个人用户的配置面板
     *
     * @param Form $form
     */
    public static function personalConfig(Form $form)
    {
    }

    /**
     * 在 write-post.php 页面底部注入编辑器资源与初始化脚本
     *
     * @access public
     * @return void
     */
    public static function render()
    {
        $options = Options::alloc();
        $baseUrl = $options->rootUrl;
        $cssUrl = \Typecho\Common::url('usr/plugins/Pictools/static/pictools.css', $baseUrl);
        $jsUrl = \Typecho\Common::url('usr/plugins/Pictools/static/pictools.js', $baseUrl);

        echo '<link rel="stylesheet" href="' . htmlspecialchars($cssUrl) . '?v=1.3.0" />' . "\n";
        echo '<script src="' . htmlspecialchars($jsUrl) . '?v=1.3.0"></script>' . "\n";
        echo '<div id="pictools-modal" class="pictools-modal hidden"></div>' . "\n";
        echo '<script>' . "\n";
        echo '(function () {' . "\n";
        echo '    if (typeof $ === "undefined" || typeof Typecho === "undefined") {' . "\n";
        echo '        return;' . "\n";
        echo '    }' . "\n";
        echo '    $(document).ready(function () {' . "\n";
        echo '        if (typeof Typecho.uploadFile !== "function") {' . "\n";
        echo '            return;' . "\n";
        echo '        }' . "\n";
        echo '        var originalUpload = Typecho.uploadFile;' . "\n";
        echo '        Typecho.uploadFile = function (file) {' . "\n";
        echo '            if (typeof Pictools !== "undefined" && Pictools.isImage(file)) {' . "\n";
        echo '                Pictools.edit(file, originalUpload);' . "\n";
        echo '            } else {' . "\n";
        echo '                originalUpload(file);' . "\n";
        echo '            }' . "\n";
        echo '        };' . "\n";
        echo '    });' . "\n";
        echo '})();' . "\n";
        echo '</script>' . "\n";
    }
}
