package com.sanye.sanye_anime;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.util.Log;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SanyePlayer")
public class SanyePlayerPlugin extends Plugin {
    private static final String TAG = "SanyePlayer";
    private int previousOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
    private boolean landscapeRequested;

    @PluginMethod
    public void setLandscape(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled"));
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("播放窗口不可用", "E_PLAYER_WINDOW");
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                if (enabled && !landscapeRequested) {
                    previousOrientation = activity.getRequestedOrientation();
                    activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
                    landscapeRequested = true;
                } else if (!enabled && landscapeRequested) {
                    activity.setRequestedOrientation(previousOrientation);
                    landscapeRequested = false;
                }
            } catch (Exception failure) {
                // 窗口在回调执行前被销毁时以前会把 Promise 永久挂起：客户端只 catch 不设超时，
                // 界面就一直停在「旋转中」。这里明确回错（VQ-60）。
                Log.w(TAG, "横竖屏切换失败", failure);
                call.reject("横竖屏切换失败", "E_PLAYER_WINDOW", failure);
                return;
            }
            call.resolve(new JSObject());
        });
    }

    /** 横屏全屏时收起状态栏和导航栏，退出后立即恢复，避免系统栏占用画面。 */
    @PluginMethod
    public void setImmersive(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled"));
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("播放窗口不可用", "E_PLAYER_WINDOW");
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                Window window = activity.getWindow();
                WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
                controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                if (enabled) {
                    // 全屏时内容可以铺满整块屏幕（含刘海/挖孔区），与网页侧的 viewport-fit=cover 配套，
                    // 否则横屏会沿挖孔留出一条空白，画面看起来被推到一边。
                    // minSdk 29 > P(28)，版本判断是死代码（lint ObsoleteSdkInt），这里直接执行。
                    WindowManager.LayoutParams attributes = window.getAttributes();
                    attributes.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                    window.setAttributes(attributes);
                    WindowCompat.setDecorFitsSystemWindows(window, false);
                    controller.hide(WindowInsetsCompat.Type.systemBars());
                } else {
                    WindowCompat.setDecorFitsSystemWindows(window, true);
                    WindowManager.LayoutParams attributes = window.getAttributes();
                    attributes.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT;
                    window.setAttributes(attributes);
                    controller.show(WindowInsetsCompat.Type.systemBars());
                }
            } catch (Exception failure) {
                Log.w(TAG, "全屏系统栏切换失败", failure);
                call.reject("全屏切换失败", "E_PLAYER_WINDOW", failure);
                return;
            }
            call.resolve(new JSObject());
        });
    }

    /** 播放中保持屏幕常亮，暂停、出错或退出播放器时立即恢复系统休眠策略。 */
    @PluginMethod
    public void setKeepAwake(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled"));
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("播放窗口不可用", "E_PLAYER_WINDOW");
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                Window window = activity.getWindow();
                if (enabled) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } catch (Exception failure) {
                Log.w(TAG, "屏幕常亮切换失败", failure);
                call.reject("屏幕常亮切换失败", "E_PLAYER_WINDOW", failure);
                return;
            }
            call.resolve(new JSObject());
        });
    }

    /**
     * WebView 重载后 JS 侧会重新下发一次横竖屏状态，插件内的标志必须回到初始值，
     * 否则「上次播放退出后仍是横屏」会让下一次进入播放器不再下发横屏请求（VQ-60）。
     *
     * 同时把窗口上的状态一起复位（VQ-62）：此前只复位了插件里的两个布尔量，
     * 「常亮 / 沉浸式 / 方向锁 / 挖孔模式」会留在窗口上；重载后的 JS 只要没有重新下发
     * enabled=false，用户就会拿到永不熄屏或锁死横屏的残留状态。
     */
    @Override
    protected void handleOnDestroy() {
        final boolean restoreOrientation = landscapeRequested;
        final int orientation = previousOrientation;
        Activity activity = getActivity();
        if (activity != null) {
            activity.runOnUiThread(() -> {
                try {
                    Window window = activity.getWindow();
                    window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    WindowManager.LayoutParams attributes = window.getAttributes();
                    attributes.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT;
                    window.setAttributes(attributes);
                    WindowCompat.setDecorFitsSystemWindows(window, true);
                    WindowCompat.getInsetsController(window, window.getDecorView()).show(WindowInsetsCompat.Type.systemBars());
                    if (restoreOrientation) activity.setRequestedOrientation(orientation);
                } catch (Exception failure) {
                    Log.w(TAG, "退出播放器时复位窗口状态失败", failure);
                }
            });
        }
        landscapeRequested = false;
        previousOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
        super.handleOnDestroy();
    }
}
