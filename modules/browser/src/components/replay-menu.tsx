import { AdminDriver, RecordingInfo } from '@starwards/core';
import React, { useEffect, useState } from 'react';

import { Button } from './arwes-compat';

type Props = { adminDriver: AdminDriver };

export function ReplayMenu({ adminDriver }: Props) {
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
        <pre key="Replay">
            <h2>Replay</h2>
            {recordings.map((r) => (
                <Button key={r.name} palette="primary" onClick={() => adminDriver.startReplay(r.name)}>
                    <div data-id={`replay ${r.name}`}>
                        {r.mapName} — {new Date(r.startedAt).toLocaleString()} ({Math.round(r.durationSeconds)}s)
                    </div>
                </Button>
            ))}
        </pre>
    );
}
