import { AdminDriver } from '@starwards/core';
import fileDownload from 'js-file-download';
import { savedGameFileExtension } from '../drop-file';
import { useCallback } from 'react';

export function useSaveGameHandler(adminDriver: AdminDriver | null) {
    return useCallback(() => {
        if (adminDriver) {
            void adminDriver.saveGame().then((content: string) => {
                const d = new Date();
                fileDownload(
                    content,
                    `save_${d.getDate()}-${
                        d.getMonth() + 1
                    }-${d.getFullYear()}_${d.getHours()}:${d.getMinutes()}${savedGameFileExtension}`,
                );
            });
        }
    }, [adminDriver]);
}
