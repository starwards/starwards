import { Blockquote, FrameCorners, Text } from './arwes-compat';
import { FileRejection, useDropzone } from 'react-dropzone';
import React, { useCallback, useState } from 'react';

import { AdminDriver } from '@starwards/core';
import fileDownload from 'js-file-download';
import { savedGameFileExtension } from '../drop-file';

const saveFileExtention = savedGameFileExtension;

export function useSaveGameHandler(adminDriver: AdminDriver | null) {
    return useCallback(() => {
        if (adminDriver) {
            void adminDriver.saveGame().then((content: string) => {
                const d = new Date();
                fileDownload(
                    content,
                    `save_${d.getDate()}-${
                        d.getMonth() + 1
                    }-${d.getFullYear()}_${d.getHours()}:${d.getMinutes()}${saveFileExtention}`,
                );
            });
        }
    }, [adminDriver]);
}

type Props = { adminDriver: AdminDriver };
export function LoadGame({ adminDriver }: Props) {
    const [errors, setErrors] = useState<string[]>([]);
    const onDrop = useCallback(
        (acceptedFiles: File[], fileRejections: FileRejection[]) => {
            const errorMsgs = fileRejections.flatMap((fr) => fr.errors.map((e) => e.message));
            acceptedFiles.forEach((file) => {
                if (file.name.endsWith(saveFileExtention)) {
                    const reader = new FileReader();
                    reader.onload = () => {
                        if (typeof reader.result === 'string') {
                            adminDriver.loadGame(reader.result);
                        }
                    };
                    reader.readAsText(file);
                } else {
                    errorMsgs.push('File type must be ' + saveFileExtention);
                }
            });
            setErrors(errorMsgs);
        },
        [adminDriver],
    );
    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        multiple: false,
        // a file dropped anywhere on the lobby is handled by the page (see `useDropFile`)
        noDrag: true,
        accept: { 'application/starwards': [saveFileExtention] },
    });

    return (
        <div {...getRootProps()}>
            {errors.length ? (
                <Blockquote>
                    {errors.map((e, i) => (
                        <Text key={i}>{e}</Text>
                    ))}
                </Blockquote>
            ) : null}
            <FrameCorners palette={isDragActive ? 'success' : 'primary'}>
                <div style={{ width: 400, height: 100 }}>
                    <input {...getInputProps()} />
                    <h2>Load Game</h2>
                    <p>Click to choose a {saveFileExtention} file, or drop it anywhere on this page</p>
                </div>
            </FrameCorners>
        </div>
    );
}
