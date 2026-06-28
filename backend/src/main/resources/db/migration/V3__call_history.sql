-- V3: call_history (per-side call records)

CREATE TABLE call_history (
    id            BIGSERIAL    PRIMARY KEY,
    call_id       VARCHAR(36)  NOT NULL,
    viewer_id     VARCHAR(50)  NOT NULL,
    peer_id       VARCHAR(50)  NOT NULL,
    direction     VARCHAR(20)  NOT NULL,
    end_reason    VARCHAR(20)  NOT NULL,
    duration_ms   BIGINT,
    started_at    TIMESTAMPTZ,
    ended_at      TIMESTAMPTZ  NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_call_history_call_viewer ON call_history (call_id, viewer_id);
CREATE INDEX        idx_call_history_viewer_ended ON call_history (viewer_id, ended_at DESC);
CREATE INDEX        idx_call_history_ended        ON call_history (ended_at DESC);