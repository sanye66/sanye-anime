package com.sanye.sanye_anime;

import android.app.AlertDialog;
import android.app.PictureInPictureParams;
import android.content.pm.PackageManager;
import android.util.Rational;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.view.GestureDetector;
import android.view.MotionEvent;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.ForwardingPlayer;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.TrackSelectionParameters;
import androidx.media3.common.Tracks;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.analytics.AnalyticsListener;
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.session.MediaSession;
import androidx.media3.ui.PlayerControlView;
import androidx.media3.ui.PlayerView;
import androidx.media3.ui.TimeBar;
import com.getcapacitor.JSObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.lang.ref.WeakReference;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;

@UnstableApi
public final class SanyeMediaPlayerActivity extends AppCompatActivity {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService subtitleIo = Executors.newSingleThreadExecutor();
    private WeakReference<SanyeMedia3Plugin> owner = new WeakReference<>(null);
    private Bundle request;
    private ExoPlayer player;
    private MediaSession mediaSession;
    private Media3PlaybackMetrics metrics;
    private Media3PlaybackWatchdog watchdog;
    private Media3VideoMetrics videoMetrics;
    private Player.Listener playbackListener;
    private AnalyticsListener analyticsListener;
    private volatile boolean handoff;
    private boolean locked;
    private boolean boosting;
    private float boostRestoreRate;
    private Button lockButton;
    private LinearLayout transitionPanel;
    private TextView transitionLabel;
    private boolean endedPanel;
    private int autoNextRemaining;
    private final Runnable handoffTimeout = () -> {
        if (!handoff || this.closing) return;
        toast("切换等待超时，请重试或选择其他线路");
        close("closed", null);
    };
    private final Runnable autoNextTick = new Runnable() {
        @Override public void run() {
            if (!canAutoNext() || !endedPanel) { cancelAutoNext(); return; }
            if (autoNextRemaining <= 0) { close("action", "next"); return; }
            transitionLabel.setText(getString(R.string.sanye_media3_auto_next, autoNextRemaining--));
            main.postDelayed(this, 1000);
        }
    };
    private AtomicLong renderedPositionUs = new AtomicLong(C.TIME_UNSET);
    private boolean userSeeking;
    private PlayerView video;
    private PlayerControlView controls;
    private LinearLayout root;
    private FrameLayout stage;
    private TextView gestureHud;
    private final Runnable hideGestureHud = () -> { if (gestureHud != null) gestureHud.setVisibility(View.GONE); };
    private TextView heading;
    private TextView status;
    private LinearLayout actions;
    private HorizontalScrollView actionBar;
    private Button fullScreenButton;
    private boolean fullscreen;
    private boolean pictureInPicture;
    private boolean pictureInPictureRequested;
    private boolean stopped;
    private boolean wasPictureInPicture;
    private boolean firstFrame;
    private volatile boolean closing;
    private boolean foreground;
    private boolean resumedOnce;
    private String error = "";
    private String errorCode = "";
    private volatile int generation;
    private File subtitleFile;
    private String subtitleSource;
    private long subtitleOffset;
    private String subtitleRequestToken = "";
    private final Runnable progress = new Runnable() {
        @Override public void run() {
            if (player != null && !closing) {
                if (handoff) return;
                if (checkBudget()) return;
                emit(null, null, false);
                main.postDelayed(this, 1000);
            }
        }
    };
    private final Runnable sleep = () -> {
        if (player != null) {
            player.pause();
            emit("sleep", null, false);
            toast("睡眠定时已暂停播放");
        }
    };
    private final ActivityResultLauncher<String[]> subtitlePicker = registerForActivityResult(
            new ActivityResultContracts.OpenDocument(), uri -> {
                if (uri != null && request != null && subtitleRequestToken.equals(request.getString("token"))) importSubtitle(uri);
                subtitleRequestToken = "";
            });

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setVolumeControlStream(android.media.AudioManager.STREAM_MUSIC);
        Bundle incoming = getIntent().getBundleExtra("request");
        SanyeMedia3Plugin plugin = SanyeMedia3Plugin.owner(incoming);
        if (plugin == null || savedInstanceState != null) { finish(); return; }
        owner = new WeakReference<>(plugin);
        plugin.attach(this);
        buildInterface();
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (locked) { setLocked(false); return; }
                if (handoff) { close("closed", null); return; }
                if (fullscreen) setFullscreen(false);
                else close("closed", null);
            }
        });
        replace(incoming);
    }

    private void buildInterface() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(8, 20, 40));
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            androidx.core.graphics.Insets safe = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            return insets;
        });
        heading = text(18);
        heading.setMaxLines(2);
        heading.setPadding(dp(16), dp(12), dp(16), dp(8));
        root.addView(heading, new LinearLayout.LayoutParams(-1, -2));
        video = new PlayerView(this);
        video.setUseController(true);
        video.setControllerAutoShow(true);
        video.setControllerHideOnTouch(true);
        video.setControllerShowTimeoutMs(3200);
        GestureDetector gestures = new GestureDetector(this, new GestureDetector.SimpleOnGestureListener() {
            @Override public boolean onDown(@NonNull MotionEvent event) { return true; }
            @Override public boolean onSingleTapConfirmed(@NonNull MotionEvent event) {
                if (pictureInPicture || locked || handoff) return false;
                video.performClick();
                return true;
            }
            @Override public boolean onDoubleTap(@NonNull MotionEvent event) {
                if (player == null || closing || locked || handoff || pictureInPicture || !player.isCurrentMediaItemSeekable()) return false;
                long delta = event.getX() < video.getWidth() / 2f ? -10000 : 10000;
                long duration = player.getDuration();
                player.seekTo(Math.max(0, duration > 0 ? Math.min(duration, player.getCurrentPosition() + delta) : player.getCurrentPosition() + delta));
                video.showController();
                toast(delta < 0 ? "后退 10 秒" : "前进 10 秒");
                return true;
            }
            @Override public boolean onScroll(MotionEvent start, @NonNull MotionEvent current, float distanceX, float distanceY) {
                if (start == null || player == null || locked || handoff || pictureInPicture || boosting || Math.abs(current.getY() - start.getY()) < dp(24)
                        || Math.abs(current.getY() - start.getY()) < Math.abs(current.getX() - start.getX()) * 1.5) return false;
                float delta = distanceY / Math.max(dp(180), video.getHeight());
                if (start.getX() < video.getWidth() / 2f) {
                    WindowManager.LayoutParams params = getWindow().getAttributes();
                    float brightness = params.screenBrightness < 0 ? .5f : params.screenBrightness;
                    params.screenBrightness = Math.max(.02f, Math.min(1f, brightness + delta));
                    getWindow().setAttributes(params);
                    gestureHint("亮度 " + Math.round(params.screenBrightness * 100) + "%");
                } else {
                    player.setVolume(Math.max(0, Math.min(1, player.getVolume() + delta)));
                    gestureHint("音量 " + Math.round(player.getVolume() * 100) + "%");
                }
                return true;
            }
            @Override public void onLongPress(@NonNull MotionEvent event) {
                if (player == null || closing || handoff || locked || pictureInPicture || endedPanel || boosting) return;
                boostRestoreRate = player.getPlaybackParameters().speed;
                boosting = true;
                player.setPlaybackSpeed(2);
                gestureHint("临时 2 倍速，松开恢复");
            }
        });
        // 单击在 GestureDetector 确认后调用 PlayerView.performClick，双击/滑动不能被误识别为单击。
        video.setOnTouchListener(new View.OnTouchListener() {
            @android.annotation.SuppressLint("ClickableViewAccessibility")
            @Override public boolean onTouch(View view, MotionEvent event) {
                gestures.onTouchEvent(event);
                if (event.getActionMasked() == MotionEvent.ACTION_UP || event.getActionMasked() == MotionEvent.ACTION_CANCEL) restoreBoost();
                return true;
            }
        });
        video.setBackgroundColor(Color.BLACK);
        video.setKeepContentOnPlayerReset(false);
        stage = new FrameLayout(this);
        stage.setBackgroundColor(Color.BLACK);
        stage.addView(video, new FrameLayout.LayoutParams(-1, -1));
        root.addView(stage, new LinearLayout.LayoutParams(-1, dp(248)));
        root.addOnLayoutChangeListener((view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> resizeVideo());
        controls = video.findViewById(androidx.media3.ui.R.id.exo_controller);
        controls.setShowTimeoutMs(3200);
        controls.setShowNextButton(false);
        controls.setShowPreviousButton(false);
        View progressView = controls.findViewById(androidx.media3.ui.R.id.exo_progress);
        if (progressView instanceof TimeBar) ((TimeBar) progressView).addListener(new TimeBar.OnScrubListener() {
            @Override public void onScrubStart(@NonNull TimeBar timeBar, long position) { userSeeking = true; cancelAutoNext(); checkBudget(); }
            @Override public void onScrubMove(@NonNull TimeBar timeBar, long position) { gestureHint("跳转至 " + timeLabel(position)); }
            @Override public void onScrubStop(@NonNull TimeBar timeBar, long position, boolean canceled) {
                userSeeking = false;
                if (watchdog != null) watchdog.discontinuity(SystemClock.elapsedRealtime(), renderedPositionUs.get());
            }
        });
        actions = new LinearLayout(this);
        actions.setGravity(Gravity.CENTER_VERTICAL);
        HorizontalScrollView bar = new HorizontalScrollView(this);
        actionBar = bar;
        bar.setHorizontalScrollBarEnabled(false);
        bar.addView(actions, new HorizontalScrollView.LayoutParams(-2, -1));
        FrameLayout.LayoutParams toolbar = new FrameLayout.LayoutParams(-1, dp(48), Gravity.BOTTOM);
        stage.addView(bar, toolbar);
        gestureHud = text(16);
        gestureHud.setPadding(dp(16), dp(8), dp(16), dp(8));
        gestureHud.setBackgroundColor(Color.argb(200, 8, 20, 40));
        gestureHud.setVisibility(View.GONE);
        stage.addView(gestureHud, new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER));
        bar.setBackgroundColor(Color.rgb(8, 20, 40));
        video.setControllerVisibilityListener((PlayerView.ControllerVisibilityListener) visibility -> {
            if (!pictureInPicture) actionBar.setVisibility(fullscreen ? visibility : View.VISIBLE);
        });
        button("返回", () -> close("closed", null));
        fullScreenButton = button("全屏", () -> setFullscreen(!fullscreen));
        button("选集", this::episodes);
        button("下一集", () -> { if (request != null && request.getBoolean("hasNext", false)) close("action", "next"); else toast("已是最后一集"); });
        lockButton = button("锁定", () -> setLocked(!locked));
        button("工具", this::tools);
        transitionPanel = new LinearLayout(this);
        transitionPanel.setOrientation(LinearLayout.VERTICAL);
        transitionPanel.setGravity(Gravity.CENTER);
        transitionPanel.setPadding(dp(16), dp(12), dp(16), dp(12));
        transitionPanel.setBackgroundColor(Color.argb(235, 8, 20, 40));
        transitionLabel = text(16);
        transitionPanel.addView(transitionLabel);
        transitionPanel.setVisibility(View.GONE);
        stage.addView(transitionPanel, new FrameLayout.LayoutParams(-1, -2, Gravity.CENTER));
        status = text(14);
        status.setPadding(dp(16), dp(12), dp(16), dp(12));
        root.addView(status, new LinearLayout.LayoutParams(-1, -2));
        setContentView(root);
        controls.show();
    }

    private TextView text(int size) {
        TextView view = new TextView(this);
        view.setTextColor(Color.rgb(248, 243, 231));
        view.setTextSize(size);
        return view;
    }

    private void gestureHint(String label) {
        if (gestureHud == null) return;
        gestureHud.setText(label); gestureHud.setVisibility(View.VISIBLE);
        main.removeCallbacks(hideGestureHud); main.postDelayed(hideGestureHud, 800);
    }

    private Button button(String label, Runnable action) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextSize(13);
        button.setTextColor(Color.rgb(8, 20, 40));
        button.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(243, 200, 107)));
        button.setMinWidth(0);
        button.setMinimumWidth(0);
        button.setPadding(dp(10), 0, dp(10), 0);
        actions.addView(button, new LinearLayout.LayoutParams(-2, dp(48)));
        button.setOnClickListener(view -> {
            if (locked && button != lockButton && !"返回".contentEquals(button.getText())) return;
            if (handoff && button != lockButton && !"返回".contentEquals(button.getText())) return;
            action.run();
        });
        return button;
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private String timeLabel(long position) {
        long seconds = Math.max(0, position / 1000);
        return String.format(Locale.ROOT, "%02d:%02d", seconds / 60, seconds % 60);
    }

    private void restoreBoost() {
        if (!boosting) return;
        boosting = false;
        if (player != null) player.setPlaybackSpeed(boostRestoreRate);
    }

    private void setLocked(boolean enabled) {
        locked = enabled;
        restoreBoost();
        lockButton.setText(enabled ? "解锁" : "锁定");
        video.setUseController(!enabled && !handoff);
        for (int index = 0; index < actions.getChildCount(); index++) {
            View child = actions.getChildAt(index);
            child.setEnabled(!enabled || child == lockButton || (child instanceof Button && "返回".contentEquals(((Button) child).getText())));
        }
        if (enabled) { video.hideController(); actionBar.setVisibility(View.VISIBLE); }
    }

    private void panelButton(String label, Runnable action) {
        Button entry = new Button(this);
        entry.setText(label);
        entry.setTextColor(Color.rgb(8, 20, 40));
        entry.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(243, 200, 107)));
        transitionPanel.addView(entry, new LinearLayout.LayoutParams(-1, -2));
        entry.setOnClickListener(view -> {
            if (locked && !"返回".equals(label)) { toast("请先解锁"); return; }
            action.run();
        });
    }

    private void showTransition(String message, boolean waiting) {
        transitionPanel.removeViews(1, transitionPanel.getChildCount() - 1);
        transitionLabel.setText(message);
        transitionPanel.setVisibility(View.VISIBLE);
        panelButton(waiting ? "取消并返回" : "返回", () -> close("closed", null));
    }

    private boolean canAutoNext() {
        return request != null && player != null && Media3Tuning.autoNext(request.getBoolean("hasNext", false),
                request.getBoolean("autoNext", true), foreground, pictureInPicture,
                !player.getPlayWhenReady(), handoff);
    }

    private void cancelAutoNext() {
        main.removeCallbacks(autoNextTick);
        if (endedPanel && transitionLabel != null) transitionLabel.setText("播放结束");
    }

    private void showEnded() {
        if (endedPanel || handoff || closing) return;
        endedPanel = true;
        transitionPanel.removeViews(1, transitionPanel.getChildCount() - 1);
        transitionLabel.setText("播放结束");
        transitionPanel.setVisibility(View.VISIBLE);
        panelButton("重播", () -> {
            cancelAutoNext(); endedPanel = false; transitionPanel.setVisibility(View.GONE);
            if (player != null) {
                watchdog = new Media3PlaybackWatchdog(SystemClock.elapsedRealtime(), request.getInt("firstFrameTimeoutMs", 30000));
                player.seekTo(0); player.play();
            }
        });
        if (request.getBoolean("hasNext", false)) panelButton("下一集", () -> close("action", "next"));
        panelButton("取消自动连播", this::cancelAutoNext);
        panelButton("返回", () -> close("closed", null));
        if (canAutoNext()) { autoNextRemaining = Media3Tuning.AUTO_NEXT_SECONDS; main.post(autoNextTick); }
    }

    private void resizeVideo() {
        if (video == null) return;
        int width = Math.max(0, root.getWidth() - root.getPaddingLeft() - root.getPaddingRight());
        LinearLayout.LayoutParams layout = (LinearLayout.LayoutParams) stage.getLayoutParams();
        int height = fullscreen || pictureInPicture ? 0 : width * 9 / 16 + dp(48);
        float weight = fullscreen || pictureInPicture ? 1 : 0;
        if (layout.height != height || layout.weight != weight) {
            layout.height = height;
            layout.weight = weight;
            stage.setLayoutParams(layout);
        }
        FrameLayout.LayoutParams image = (FrameLayout.LayoutParams) video.getLayoutParams();
        int videoHeight = fullscreen || pictureInPicture ? -1 : width * 9 / 16;
        if (image.height != videoHeight) { image.height = videoHeight; video.setLayoutParams(image); }
        FrameLayout.LayoutParams toolbar = (FrameLayout.LayoutParams) actionBar.getLayoutParams();
        int toolbarGravity = fullscreen ? Gravity.TOP : Gravity.BOTTOM;
        if (toolbar.gravity != toolbarGravity) { toolbar.gravity = toolbarGravity; actionBar.setLayoutParams(toolbar); }
    }

    private void setFullscreen(boolean enabled) {
        fullscreen = enabled;
        heading.setVisibility(enabled ? View.GONE : View.VISIBLE);
        status.setVisibility(enabled || status.getText().length() == 0 ? View.GONE : View.VISIBLE);
        fullScreenButton.setText(enabled ? "退出全屏" : "全屏");
        setRequestedOrientation(enabled ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        if (enabled) WindowCompat.getInsetsController(getWindow(), root).hide(WindowInsetsCompat.Type.systemBars());
        else WindowCompat.getInsetsController(getWindow(), root).show(WindowInsetsCompat.Type.systemBars());
        resizeVideo();
    }

    private void enterSmallWindow() {
        if (player == null || closing || !firstFrame) { toast("画面就绪后可以进入小窗"); return; }
        pictureInPictureRequested = true;
        try {
            if (!enterPictureInPictureMode(new PictureInPictureParams.Builder().setAspectRatio(new Rational(16, 9)).build())) {
                pictureInPictureRequested = false;
                toast("系统暂时无法打开小窗");
            }
        } catch (RuntimeException failure) {
            pictureInPictureRequested = false;
            toast("系统暂时无法打开小窗");
        }
        // 某些系统接受请求后仍可能取消进入，不能一直把后台当作小窗播放。
        main.postDelayed(() -> {
            if (!pictureInPictureRequested || pictureInPicture || closing) return;
            pictureInPictureRequested = false;
            if (!foreground && player != null) player.pause();
        }, 1500);
    }

    @Override public void onPictureInPictureModeChanged(boolean enabled, @NonNull Configuration configuration) {
        super.onPictureInPictureModeChanged(enabled, configuration);
        pictureInPictureRequested = false;
        pictureInPicture = enabled;
        cancelAutoNext();
        restoreBoost();
        wasPictureInPicture |= enabled;
        heading.setVisibility(enabled || fullscreen ? View.GONE : View.VISIBLE);
        controls.setVisibility(enabled ? View.GONE : View.VISIBLE);
        actionBar.setVisibility(enabled ? View.GONE : View.VISIBLE);
        status.setVisibility(enabled || fullscreen || status.getText().length() == 0 ? View.GONE : View.VISIBLE);
        resizeVideo();
        if (player != null && !enabled && !foreground) player.pause();
        emit(enabled ? "pip" : "foreground", null, false);
        if (!enabled) main.postDelayed(this::closeDismissedSmallWindow, 500);
    }

    private void closeDismissedSmallWindow() {
        if (wasPictureInPicture && stopped && !pictureInPicture && !pictureInPictureRequested && !foreground && !isChangingConfigurations()) close("closed", null);
    }

    @Override protected void onStart() {
        super.onStart();
        stopped = false;
    }

    @Override protected void onStop() {
        super.onStop();
        stopped = true;
        closeDismissedSmallWindow();
    }

    @Override public void onConfigurationChanged(@NonNull Configuration configuration) {
        super.onConfigurationChanged(configuration);
        resizeVideo();
    }

    void replace(Bundle incoming) {
        if (closing || SanyeMedia3Plugin.owner(incoming) == null) return;
        restoreBoost();
        if (!handoff) emit("replaced", null, true);
        generation++;
        main.removeCallbacks(handoffTimeout);
        cancelAutoNext();
        main.removeCallbacks(sleep);
        userSeeking = false;
        renderedPositionUs = new AtomicLong(C.TIME_UNSET);
        if (player != null) {
            if (playbackListener != null) player.removeListener(playbackListener);
            if (analyticsListener != null) player.removeAnalyticsListener(analyticsListener);
            player.stop();
            player.clearMediaItems();
            player.setTrackSelectionParameters(resetTrackSelection(player.getTrackSelectionParameters()));
        }
        if (subtitleFile != null && !subtitleFile.delete()) subtitleFile.deleteOnExit();
        subtitleFile = null; subtitleSource = null; subtitleOffset = 0;
        handoff = false; endedPanel = false;
        transitionPanel.setVisibility(View.GONE);
        setLocked(false);
        request = new Bundle(incoming);
        firstFrame = false;
        error = "";
        errorCode = "";
        metrics = new Media3PlaybackMetrics(SystemClock.elapsedRealtime());
        videoMetrics = new Media3VideoMetrics();
        watchdog = new Media3PlaybackWatchdog(SystemClock.elapsedRealtime(), request.getInt("firstFrameTimeoutMs", 30000));
        userSeeking = false;
        heading.setText(getString(R.string.sanye_media3_heading, request.getString("title", "正在播放"), request.getString("episode", "")));
        boolean light = request.getBoolean("lightTheme", false);
        root.setBackgroundColor(light ? Color.rgb(248, 243, 231) : Color.rgb(8, 20, 40));
        heading.setTextColor(light ? Color.rgb(38, 56, 69) : Color.rgb(248, 243, 231));
        status.setTextColor(light ? Color.rgb(77, 96, 107) : Color.rgb(156, 178, 194));
        prepare((long) (request.getDouble("position", 0) * 1000), request.getBoolean("autoPlay", true));
        main.removeCallbacks(progress);
        main.post(progress);
    }

    private static TrackSelectionParameters resetTrackSelection(TrackSelectionParameters parameters) {
        return parameters.buildUpon().clearOverrides()
                .setTrackTypeDisabled(C.TRACK_TYPE_VIDEO, false)
                .setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, false)
                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
                .setMaxVideoSize(Media3Tuning.MAX_VIDEO_WIDTH, Media3Tuning.MAX_VIDEO_HEIGHT).build();
    }

    private void prepare(long position, boolean autoplay) {
        int sessionGeneration = ++generation;
        if (player == null) {
            DefaultTrackSelector trackSelector = new DefaultTrackSelector(this);
            trackSelector.setParameters(trackSelector.buildUponParameters()
                    .setMaxVideoSize(Media3Tuning.MAX_VIDEO_WIDTH, Media3Tuning.MAX_VIDEO_HEIGHT)
                    .setExceedVideoConstraintsIfNecessary(true));
            player = new ExoPlayer.Builder(this).setTrackSelector(trackSelector)
                    .setLoadControl(new DefaultLoadControl.Builder().setBufferDurationsMs(Media3Tuning.MIN_BUFFER_MS,
                            Media3Tuning.MAX_BUFFER_MS, Media3Tuning.START_BUFFER_MS, Media3Tuning.REBUFFER_MS)
                            .setTargetBufferBytes(Media3Tuning.TARGET_BUFFER_BYTES).setPrioritizeTimeOverSizeThresholds(false).build()).build();
            player.setVideoChangeFrameRateStrategy(C.VIDEO_CHANGE_FRAME_RATE_STRATEGY_ONLY_IF_SEAMLESS);
        }
        ExoPlayer current = player;
        AtomicLong frames = new AtomicLong(C.TIME_UNSET);
        renderedPositionUs = frames;
        Media3VideoMetrics observations = videoMetrics;
        current.setVideoFrameMetadataListener((presentationTimeUs, releaseTimeNs, format, mediaFormat) -> {
            if (generation != sessionGeneration || handoff || closing) return;
            frames.set(presentationTimeUs);
            if (observations != null) observations.rendered(SystemClock.elapsedRealtime());
        });
        if (watchdog != null) watchdog.discontinuity(SystemClock.elapsedRealtime(), frames.get());
        current.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(), true);
        current.setHandleAudioBecomingNoisy(true);
        current.setPlaybackSpeed(request.getFloat("rate", 1));
        current.setVolume(request.getFloat("volume", 1));
        playbackListener = new Player.Listener() {
            private boolean valid() { return !closing && !handoff && player == current && generation == sessionGeneration; }
            @Override public void onEvents(@NonNull Player changed, @NonNull Player.Events events) {
                if (!valid()) return;
                video.setKeepScreenOn(current.isPlaying());
                String message = !error.isEmpty() ? error : current.getPlaybackState() == Player.STATE_BUFFERING ? "正在缓冲…" : "";
                status.setText(message);
                status.setVisibility(!fullscreen && !pictureInPicture && !message.isEmpty() ? View.VISIBLE : View.GONE);
                if (current.getPlaybackState() != Player.STATE_ENDED && checkBudget()) return;
                emit(null, null, false);
                if (current.getPlaybackState() == Player.STATE_ENDED) showEnded();
                if (!current.getPlayWhenReady()) cancelAutoNext();
            }
            @Override public void onRenderedFirstFrame() {
                if (!valid()) return;
                firstFrame = true;
                checkBudget();
                emit(null, null, false);
            }
            @Override public void onPlayerError(@NonNull PlaybackException failure) {
                if (!valid()) return;
                error = "播放失败（" + failure.getErrorCodeName() + "），请在工具中重试或换线";
                errorCode = failure.getErrorCodeName();
                status.setText(error);
                close("error", null);
            }
            @Override public void onPositionDiscontinuity(@NonNull Player.PositionInfo before, @NonNull Player.PositionInfo after, int reason) {
                if (valid() && metrics != null) metrics.discontinuity(SystemClock.elapsedRealtime(), after.positionMs);
                if (valid() && watchdog != null) watchdog.discontinuity(SystemClock.elapsedRealtime(), renderedPositionUs.get());
                if (valid() && reason == Player.DISCONTINUITY_REASON_SEEK && videoMetrics != null) videoMetrics.seeking(SystemClock.elapsedRealtime());
            }
            @Override public void onPlaybackParametersChanged(@NonNull androidx.media3.common.PlaybackParameters parameters) {
                if (!valid()) return;
                float allowed = Media3PlaybackPolicy.rate(parameters.speed);
                if (!boosting) request.putFloat("rate", allowed);
                if (Math.abs(allowed - parameters.speed) > 0.0001) current.setPlaybackSpeed(allowed);
            }
        };
        current.addListener(playbackListener);
        analyticsListener = new AnalyticsListener() {
            private boolean valid() { return !closing && !handoff && generation == sessionGeneration && observations != null; }
            @Override public void onVideoInputFormatChanged(EventTime time, Format format, androidx.media3.exoplayer.DecoderReuseEvaluation reuse) {
                if (valid()) observations.format(format.width, format.height, format.frameRate, format.bitrate);
            }
            @Override public void onDroppedVideoFrames(EventTime time, int count, long elapsedMs) { if (valid()) observations.dropped(count); }
            @Override public void onVideoDecoderInitialized(EventTime time, String name, long initializedMs, long durationMs) { if (valid()) observations.decoder = name; }
        };
        current.addAnalyticsListener(analyticsListener);
        MediaItem.Builder media = new MediaItem.Builder().setMediaId(request.getString("id", ""))
                .setUri(request.getString("url", "")).setMimeType(request.getString("mimeType"))
                .setMediaMetadata(new MediaMetadata.Builder().setTitle(request.getString("title", "正在播放"))
                        .setSubtitle(request.getString("episode", "")).build());
        if (subtitleFile != null) media.setSubtitleConfigurations(Collections.singletonList(
                new MediaItem.SubtitleConfiguration.Builder(Uri.fromFile(subtitleFile)).setMimeType(MimeTypes.TEXT_VTT)
                        .setLabel("导入字幕").setSelectionFlags(C.SELECTION_FLAG_DEFAULT).build()));
        video.setPlayer(current);
        controls.setPlayer(current);
        java.util.Map<String, String> headers = new java.util.LinkedHashMap<>();
        for (String name : new String[]{"Referer", "User-Agent"}) {
            String value = request.getString("header:" + name);
            if (value != null) headers.put(name, value);
        }
        // 每次播放构造当前会话的媒体源，避免换线复用旧请求头或旧字幕文件。
        current.setMediaSource(new DefaultMediaSourceFactory(Media3SafeDataSource.factory(this, subtitleFile, headers))
                .createMediaSource(media.build()), Math.max(0, position));
        current.prepare();
        ForwardingPlayer systemPlayer = new ForwardingPlayer(current) {
            private void navigate(String action) {
                if (!closing && !handoff && player == current
                        && request.getBoolean(action.equals("next") ? "hasNext" : "hasPrevious", action.equals("next"))) close("action", action);
            }
            @Override public Player.Commands getAvailableCommands() {
                Player.Commands.Builder commands = super.getAvailableCommands().buildUpon();
                if (request.getBoolean("hasNext", true)) commands.add(Player.COMMAND_SEEK_TO_NEXT).add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM);
                if (request.getBoolean("hasPrevious", false)) commands.add(Player.COMMAND_SEEK_TO_PREVIOUS).add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM);
                return commands.build();
            }
            @Override public boolean isCommandAvailable(int command) { return getAvailableCommands().contains(command); }
            @Override public void play() { if (!handoff && (foreground || pictureInPicture)) super.play(); }
            @Override public void setPlayWhenReady(boolean ready) { super.setPlayWhenReady(ready && !handoff && (foreground || pictureInPicture)); }
            @Override public void seekToNext() { navigate("next"); }
            @Override public void seekToNextMediaItem() { navigate("next"); }
            @Override public void seekToPrevious() { navigate("previous"); }
            @Override public void seekToPreviousMediaItem() { navigate("previous"); }
        };
        if (mediaSession == null) mediaSession = new MediaSession.Builder(this, systemPlayer).setId("sanye_" + request.getString("token", ""))
                .setSessionActivity(android.app.PendingIntent.getActivity(this, 0,
                        new Intent(this, SanyeMediaPlayerActivity.class).putExtra("request", new Bundle(request))
                                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_IMMUTABLE))
                .build();
        else mediaSession.setPlayer(systemPlayer);
        mediaSession.setSessionActivity(android.app.PendingIntent.getActivity(this, 0,
                new Intent(this, SanyeMediaPlayerActivity.class).putExtra("request", new Bundle(request))
                        .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_IMMUTABLE));
        current.setPlayWhenReady(autoplay && foreground);
    }

    private void emit(String reason, String action, boolean closed) {
        SanyeMedia3Plugin plugin = owner.get();
        if (plugin == null || request == null || player == null || (handoff && !closed && !"transition".equals(reason))) return;
        JSObject state = new JSObject();
        state.put("id", request.getString("id"));
        state.put("position", Math.max(0, player.getCurrentPosition()) / 1000.0);
        state.put("duration", player.getDuration() == C.TIME_UNSET ? 0 : Math.max(0, player.getDuration()) / 1000.0);
        state.put("playing", !closed && player.isPlaying());
        state.put("rate", player.getPlaybackParameters().speed);
        state.put("volume", player.getVolume());
        state.put("bufferedMs", Math.max(0, player.getBufferedPosition() - player.getCurrentPosition()));
        if (metrics != null) {
            metrics.sample(SystemClock.elapsedRealtime(), player.getCurrentPosition(), player.isPlaying(),
                    player.getPlaybackState() == Player.STATE_BUFFERING, player.getPlayWhenReady(), player.getPlaybackParameters().speed, firstFrame);
            if (metrics.firstFrameMillis() >= 0) state.put("firstFrameMs", metrics.firstFrameMillis());
            state.put("watchedSeconds", metrics.watchedSeconds());
            state.put("stallSeconds", metrics.stallSeconds());
        }
        state.put("buffering", !closed && player.getPlaybackState() == Player.STATE_BUFFERING);
        state.put("firstFrame", firstFrame);
        state.put("ended", player.getPlaybackState() == Player.STATE_ENDED);
        state.put("closed", closed);
        if (reason != null) state.put("reason", reason);
        if (action != null) state.put("action", action);
        if (!error.isEmpty() && (!closed || "error".equals(reason))) state.put("error", error);
        if (!errorCode.isEmpty()) state.put("errorCode", errorCode);
        state.put("pictureInPicture", pictureInPicture);
        if ("transition".equals(reason)) state.put("handoff", true);
        if (videoMetrics != null) {
            if (videoMetrics.width > 0) state.put("videoWidth", videoMetrics.width);
            if (videoMetrics.height > 0) state.put("videoHeight", videoMetrics.height);
            if (videoMetrics.fps > 0) state.put("videoFps", videoMetrics.fps);
            if (videoMetrics.bitrate > 0) state.put("videoBitrate", videoMetrics.bitrate);
            state.put("droppedFrames", videoMetrics.droppedFrames);
            if (!videoMetrics.decoder.isEmpty()) state.put("decoder", videoMetrics.decoder);
            if (videoMetrics.seekLatencyMs >= 0) state.put("seekLatencyMs", videoMetrics.seekLatencyMs);
        }
        plugin.emit(state);
    }

    void close(String reason, String action) {
        if (closing) return;
        if ("choice".equals(reason) || "action".equals(reason) || "error".equals(reason)) {
            if (handoff) return;
            restoreBoost();
            cancelAutoNext();
            handoff = true;
            main.removeCallbacks(progress);
            watchdog = null;
            if (player != null) player.pause();
            emit("transition", action == null && "error".equals(reason) ? "switch" : action, false);
            video.setUseController(false);
            video.setKeepScreenOn(false);
            showTransition("正在切换，请稍候…", true);
            main.postDelayed(handoffTimeout, Media3Tuning.HANDOFF_TIMEOUT_MS);
            return;
        }
        closing = true;
        release(reason, true, action);
        SanyeMedia3Plugin plugin = owner.get();
        if (plugin != null) plugin.detach(this, request == null ? "" : request.getString("token", ""));
        finish();
    }

    void transitionFailed() {
        toast("这条线路暂不可用，请重试或选择其他线路");
        close("closed", null);
    }

    private void release(String reason, boolean closed, String action) {
        restoreBoost();
        main.removeCallbacks(progress);
        main.removeCallbacks(sleep);
        main.removeCallbacks(handoffTimeout);
        cancelAutoNext();
        if (player != null) {
            if (!handoff) emit(reason, action, closed);
            generation++;
            if (mediaSession != null) { mediaSession.release(); mediaSession = null; }
            video.setPlayer(null);
            controls.setPlayer(null);
            player.release();
            player = null;
            video.setKeepScreenOn(false);
        }
        if (subtitleFile != null) {
            if (!subtitleFile.delete()) subtitleFile.deleteOnExit();
            subtitleFile = null;
        }
        subtitleSource = null;
        subtitleOffset = 0;
        watchdog = null;
        userSeeking = false;
    }

    @Override protected void onResume() {
        super.onResume();
        foreground = true;
        checkBudget();
        if (!resumedOnce && player != null && request != null && request.getBoolean("autoPlay", true)) player.play();
        resumedOnce = true;
    }

    @Override protected void onPause() {
        foreground = false;
        cancelAutoNext();
        restoreBoost();
        checkBudget();
        if (player != null && !closing && !pictureInPicture && !pictureInPictureRequested) {
            player.pause();
            emit("background", null, false);
        }
        super.onPause();
    }

    @Override protected void onDestroy() {
        if (!closing) {
            closing = true;
            release("closed", true, null);
            SanyeMedia3Plugin plugin = owner.get();
            if (plugin != null) plugin.detach(this, request == null ? "" : request.getString("token", ""));
        }
        main.removeCallbacksAndMessages(null);
        subtitleIo.shutdownNow();
        owner.clear();
        super.onDestroy();
    }

    private void toast(String message) { Toast.makeText(this, message, Toast.LENGTH_SHORT).show(); }

    private boolean checkBudget() {
        if (watchdog == null || player == null || closing) return false;
        if (player.getPlaybackState() == Player.STATE_ENDED) { watchdog = null; return false; }
        Media3PlaybackWatchdog.Failure failure = watchdog.observe(SystemClock.elapsedRealtime(), renderedPositionUs.get(), foreground || pictureInPicture,
                player.getPlayWhenReady() && player.getPlaybackSuppressionReason() == Player.PLAYBACK_SUPPRESSION_REASON_NONE,
                player.getPlaybackState() == Player.STATE_BUFFERING, firstFrame, userSeeking);
        if (failure == Media3PlaybackWatchdog.Failure.NONE) return false;
        error = failure == Media3PlaybackWatchdog.Failure.FIRST_FRAME_TIMEOUT ? "起播超过等待预算，请尝试同集备用线路"
                : "播放已连续停滞 12 秒，请尝试同集备用线路";
        errorCode = failure == Media3PlaybackWatchdog.Failure.FIRST_FRAME_TIMEOUT ? "E_FIRST_FRAME_TIMEOUT" : "E_FRAME_STALLED";
        close("error", null);
        return true;
    }

    private AlertDialog.Builder dialog() {
        return new AlertDialog.Builder(this, request != null && request.getBoolean("lightTheme", false)
                ? android.R.style.Theme_Material_Light_Dialog_Alert : android.R.style.Theme_Material_Dialog_Alert);
    }

    private void tools() {
        if (player == null || closing) return;
        String[] choices = {"播放速度", "音轨", "字幕轨", "导入 SRT / VTT 字幕", "字幕时间偏移", "睡眠定时", "重试播放", "切换线路", "清晰度", "上一集", "下一集", "小窗播放"};
        dialog().setTitle("播放工具").setItems(choices, (dialog, selected) -> {
            if (player == null || closing) return;
            switch (selected) {
                case 0: speeds(); break;
                case 1: tracks(C.TRACK_TYPE_AUDIO); break;
                case 2: tracks(C.TRACK_TYPE_TEXT); break;
                case 3:
                    subtitleRequestToken = request.getString("token", "");
                    subtitlePicker.launch(new String[]{"text/*", "application/x-subrip", "application/octet-stream"});
                    break;
                case 4: subtitleTiming(); break;
                case 5: sleepTimer(); break;
                case 6: close("action", "retry"); break;
                case 7: episodes(); break;
                case 8: tracks(C.TRACK_TYPE_VIDEO); break;
                case 9: if (request.getBoolean("hasPrevious", false)) close("action", "previous"); else toast("已是第一集"); break;
                case 10: if (request.getBoolean("hasNext", false)) close("action", "next"); else toast("已是最后一集"); break;
                case 11: if (getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) enterSmallWindow(); else toast("当前设备不支持小窗"); break;
                default: break;
            }
        }).show();
    }

    private void episodes() {
        java.util.ArrayList<Bundle> entries = request.getParcelableArrayList("choices");
        if (entries == null || entries.isEmpty()) { close("action", "episodes"); return; }
        java.util.LinkedHashSet<String> groups = new java.util.LinkedHashSet<>();
        for (Bundle entry : entries) groups.add(entry.getString("group", "选集"));
        if (groups.size() > 1) {
            String[] names = groups.toArray(new String[0]);
            dialog().setTitle("选择线路").setItems(names, (dialog, index) -> {
                java.util.ArrayList<Bundle> line = new java.util.ArrayList<>();
                for (Bundle entry : entries) if (names[index].equals(entry.getString("group", "选集"))) line.add(entry);
                showEpisodes(line, names[index]);
            }).setNegativeButton("取消", null).show();
            return;
        }
        showEpisodes(entries, "选集");
    }

    private void showEpisodes(java.util.ArrayList<Bundle> entries, String title) {
        if (player == null || closing) return;
        String[] names = new String[entries.size()];
        int checked = -1;
        for (int i = 0; i < entries.size(); i++) {
            names[i] = entries.get(i).getString("label", "选集");
            if (entries.get(i).getBoolean("selected", false)) checked = i;
        }
        dialog().setTitle(title).setSingleChoiceItems(names, checked, (dialog, index) -> {
            dialog.dismiss();
            if (player != null && !closing && !entries.get(index).getBoolean("selected", false)) close("choice", entries.get(index).getString("id"));
        }).setNegativeButton("取消", null).show();
    }

    private void speeds() {
        float[] values = {0.75f, 1, 1.25f, 1.5f, 2};
        String[] labels = new String[values.length];
        int selected = 1;
        for (int index = 0; index < values.length; index++) {
            labels[index] = String.format(Locale.getDefault(), "%s 倍", values[index]);
            if (Math.abs(player.getPlaybackParameters().speed - values[index]) < 0.01) selected = index;
        }
        dialog().setTitle("播放速度").setSingleChoiceItems(labels, selected, (dialog, index) -> {
            if (player != null) { player.setPlaybackSpeed(values[index]); request.putFloat("rate", values[index]); }
            dialog.dismiss();
        }).show();
    }

    private void tracks(int type) {
        List<String> labels = new ArrayList<>();
        List<TrackSelectionOverride> overrides = new ArrayList<>();
        labels.add(type == C.TRACK_TYPE_TEXT ? "关闭字幕" : "自动选择");
        overrides.add(null);
        int selected = 0;
        for (Tracks.Group group : player.getCurrentTracks().getGroups()) {
            if (group.getType() != type) continue;
            for (int index = 0; index < group.length; index++) {
                if (!group.isTrackSupported(index)) continue;
                Format format = group.getTrackFormat(index);
                String label = type == C.TRACK_TYPE_VIDEO ? Media3PlaybackPolicy.videoTrackLabel(format.width, format.height, format.bitrate)
                        : format.label != null ? format.label : format.language != null ? format.language
                        : type == C.TRACK_TYPE_AUDIO ? "音轨" : "字幕";
                if (label == null) continue;
                labels.add(type == C.TRACK_TYPE_VIDEO ? label : label + " " + labels.size());
                overrides.add(new TrackSelectionOverride(group.getMediaTrackGroup(), index));
                if (group.isTrackSelected(index) && (type != C.TRACK_TYPE_VIDEO
                        || player.getTrackSelectionParameters().overrides.containsKey(group.getMediaTrackGroup()))) selected = labels.size() - 1;
            }
        }
        if (labels.size() == 1 && type == C.TRACK_TYPE_AUDIO) { toast("当前媒体没有可切换的音轨"); return; }
        dialog().setTitle(type == C.TRACK_TYPE_VIDEO ? "清晰度" : type == C.TRACK_TYPE_AUDIO ? "音轨" : "字幕轨")
                .setSingleChoiceItems(labels.toArray(new String[0]), selected, (dialog, index) -> {
                    if (player != null) {
                        androidx.media3.common.TrackSelectionParameters.Builder selection = player.getTrackSelectionParameters().buildUpon()
                                .clearOverridesOfType(type).setTrackTypeDisabled(type, type == C.TRACK_TYPE_TEXT && index == 0);
                        if (overrides.get(index) != null) selection.setOverrideForType(overrides.get(index));
                        player.setTrackSelectionParameters(selection.build());
                    }
                    dialog.dismiss();
                }).show();
    }

    private void sleepTimer() {
        String[] labels = {"关闭定时", "15 分钟后暂停", "30 分钟后暂停", "60 分钟后暂停"};
        int[] minutes = {0, 15, 30, 60};
        dialog().setTitle("睡眠定时").setItems(labels, (dialog, index) -> {
            main.removeCallbacks(sleep);
            if (minutes[index] > 0) main.postDelayed(sleep, minutes[index] * 60_000L);
            toast(labels[index]);
        }).show();
    }

    private void subtitleTiming() {
        if (subtitleSource == null) { toast("请先导入本地字幕，偏移仅作用于导入字幕"); return; }
        EditText input = new EditText(this);
        input.setInputType(android.text.InputType.TYPE_CLASS_NUMBER | android.text.InputType.TYPE_NUMBER_FLAG_SIGNED);
        input.setText(String.format(Locale.ROOT, "%d", subtitleOffset));
        dialog().setTitle("字幕偏移（毫秒，正数延后）").setView(input)
                .setNegativeButton("取消", null).setPositiveButton("应用", (dialog, selected) -> {
                    try {
                        long value = Long.parseLong(input.getText().toString());
                        if (value < -600_000 || value > 600_000) throw new IllegalArgumentException();
                        installSubtitle(subtitleSource, value);
                    } catch (Exception failure) { toast("请输入 -600000 至 600000 毫秒"); }
                }).show();
    }

    private void importSubtitle(Uri uri) {
        if (!"content".equals(uri.getScheme())) { toast("请通过系统文件选择器选择字幕"); return; }
        int expected = generation;
        String sessionToken = request.getString("token", "");
        subtitleIo.execute(() -> {
            try (InputStream stream = getContentResolver().openInputStream(uri)) {
                if (stream == null) throw new java.io.IOException("字幕文件无法读取");
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                byte[] buffer = new byte[8192];
                for (int read; (read = stream.read(buffer)) != -1;) {
                    if (Thread.currentThread().isInterrupted()) return;
                    if (bytes.size() + read > Media3Subtitle.MAX_BYTES) throw new java.io.IOException("字幕不得超过 2 MB");
                    bytes.write(buffer, 0, read);
                }
                String source = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                        .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes.toByteArray())).toString();
                Media3Subtitle.webVtt(source, 0);
                main.post(() -> {
                    if (closing || expected != generation || request == null || !sessionToken.equals(request.getString("token"))) return;
                    try { installSubtitle(source, 0); toast("字幕已导入，可在工具中调整偏移"); }
                    catch (Exception failure) { toast("字幕导入失败，请检查文件格式"); }
                });
            } catch (Exception failure) {
                main.post(() -> { if (!closing && expected == generation) toast("字幕读取失败，请选择 2 MB 内的 UTF-8 SRT 或 VTT 文件"); });
            }
        });
    }

    private void installSubtitle(String source, long offset) throws java.io.IOException {
        if (player == null || closing) return;
        File imported = File.createTempFile("sanye_subtitle_", ".vtt", getCacheDir());
        try { Files.write(imported.toPath(), Media3Subtitle.webVtt(source, offset).getBytes(StandardCharsets.UTF_8)); }
        catch (java.io.IOException invalid) { if (!imported.delete()) imported.deleteOnExit(); throw invalid; }
        long position = player.getCurrentPosition();
        boolean autoplay = player.getPlayWhenReady();
        request.putFloat("rate", player.getPlaybackParameters().speed);
        request.putFloat("volume", player.getVolume());
        generation++;
        if (mediaSession != null) { mediaSession.release(); mediaSession = null; }
        video.setPlayer(null);
        controls.setPlayer(null);
        player.release();
        player = null;
        if (subtitleFile != null && !subtitleFile.delete()) subtitleFile.deleteOnExit();
        subtitleFile = imported;
        subtitleSource = source;
        subtitleOffset = offset;
        prepare(position, autoplay);
    }
}
