import { ChunkParser, RecordParser, RecordingRecord, isBinaryRecording, lineToRecord } from '@starwards/core';
import { decompress } from 'fzstd';

/** A recording file's records, from either file format. A truncated tail is dropped. */
export async function parseRecords(bytes: Uint8Array): Promise<RecordingRecord[]> {
    const records: RecordingRecord[] = [];
    if (isBinaryRecording(bytes)) {
        const chunks = new ChunkParser();
        const parser = new RecordParser();
        for (const frame of chunks.push(bytes)) records.push(...parser.push(decompress(frame)));
        return records;
    }
    for (const line of new TextDecoder().decode(bytes).split('\n')) {
        if (!line.trim()) continue;
        const record = await lineToRecord(line);
        if (record) records.push(record);
    }
    return records;
}
