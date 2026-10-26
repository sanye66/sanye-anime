package com.sanye.sanye_anime;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Handler;
import android.os.Looper;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;

final class SystemPlaybackController {
    interface Events { void emit(JSObject event); }

    private final Context context;
    private final String owner;
    private final Events events;
    private final MediaSession session;
    private final SystemPlaybackPolicy policy = new SystemPlaybackPolicy();
    private boolean closed;
    private long position;
    private boolean playing;
    private final BroadcastReceiver noisy = new BroadcastReceiver() {
        @Override public void onReceive(Context receiverContext, Intent intent) {
            if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) interrupt();
        }
    };

    SystemPlaybackController(Context context, String owner, Events events, boolean foreground) {
        this.context = context;
        this.owner = owner;
        this.events = events;
        policy.setForeground(foreground);
        session = new MediaSession(context, "sanye_anime");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() {
                if (acquireFocus(true)) command("play", null);
                else interrupt();
            }
            @Override public void onPause() { interrupt(); }
            @Override public void onStop() { interrupt(); }
            @Override public void onSeekTo(long value) { command("seek", Math.max(0, value) / 1000.0); }
        }, new Handler(Looper.getMainLooper()));
        ContextCompat.registerReceiver(context, noisy, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY),
            ContextCompat.RECEIVER_EXPORTED);
        session.setActive(true);
    }

    boolean owns(String id) { return owner.equals(id); }

    private void command(String action, Double seconds) {
        if (closed) return;
        JSObject event = new JSObject().put("id", owner).put("action", action);
        if (seconds != null) event.put("position", seconds);
        events.emit(event);
    }

    boolean acquireFocus(boolean explicitPlay) {
        return !closed && policy.canPlay(explicitPlay);
    }

    private void interrupt() {
        if (closed) return;
        policy.interrupt();
        playing = false;
        session.setPlaybackState(new PlaybackState.Builder().setActions(actions())
            .setState(PlaybackState.STATE_PAUSED, position, 0).build());
        command("pause", null);
    }

    void setForeground(boolean value) {
        policy.setForeground(value);
        if (!value) interrupt();
    }

    boolean update(String title, String episode, double duration, double seconds, boolean requestedPlaying,
                   boolean explicitPlay, boolean buffering, boolean ended, double rate) {
        if (closed) return false;
        position = SystemPlaybackPolicy.milliseconds(seconds);
        if (playing && !requestedPlaying) policy.interrupt();
        playing = requestedPlaying && acquireFocus(explicitPlay);
        session.setMetadata(new MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE, title)
            .putString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE, episode)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, episode)
            .putLong(MediaMetadata.METADATA_KEY_DURATION, SystemPlaybackPolicy.milliseconds(duration)).build());
        int state = ended ? PlaybackState.STATE_STOPPED : playing
            ? buffering ? PlaybackState.STATE_BUFFERING : PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED;
        session.setPlaybackState(new PlaybackState.Builder().setActions(actions())
            .setState(state, position, playing && !buffering && Double.isFinite(rate) && rate > 0 ? (float) rate : 0).build());
        if (requestedPlaying && !playing) command("pause", null);
        return !requestedPlaying || playing;
    }

    private long actions() {
        return PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
            | PlaybackState.ACTION_STOP | PlaybackState.ACTION_SEEK_TO;
    }

    void close() {
        if (closed) return;
        closed = true;
        session.setActive(false);
        session.release();
        context.unregisterReceiver(noisy);
    }
}
