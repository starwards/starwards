import { AdminDriver, RecordingInfo } from '@starwards/core';
import React, { useEffect, useState } from 'react';

import { Button } from './arwes-compat';

type Props = { adminDriver: AdminDriver };

/** Recordings kept by the server, each opening in the recording player. */
export function RecordingsMenu({ adminDriver }: Props) {
    const [recordings, setRecordings] = useState<RecordingInfo[]>([]);
    useEffect(() => {
        let cancelled = false;
        void adminDriver.listRecordings().then((r) => {
            if (!cancelled) setRecordings(r);
        });
        return () => {
            cancelled = true;
        };
    }, [adminDriver]);

    if (!recordings.length) {
        return null;
    }

    return (
        <pre key="Recordings">
            <h2>Recordings</h2>
            {recordings.map((r) => (
                <Button
                    key={r.name}
                    palette="primary"
                    onClick={() =>
                        window.location.assign(`player.html?src=${encodeURIComponent(`recordings/${r.name}`)}`)
                    }
                >
                    <div data-id={`recording ${r.name}`}>
                        {r.mapName} — {new Date(r.startedAt).toLocaleString()} ({Math.round(r.durationSeconds)}s)
                    </div>
                </Button>
            ))}
        </pre>
    );
}
