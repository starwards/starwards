import { Driver, NetworkAddress } from '@starwards/core';
import React, { useEffect, useState } from 'react';

import QRCode from 'qrcode';

type QrAddress = NetworkAddress & { qrDataUrl: string };

async function toQrAddresses(addresses: NetworkAddress[]): Promise<QrAddress[]> {
    return Promise.all(
        addresses.map(async (a) => ({ ...a, qrDataUrl: await QRCode.toDataURL(a.url, { margin: 1, scale: 4 }) })),
    );
}

/** Lets a phone on the same Wi-Fi join without anyone typing an IP address. */
export function NetworkInfoPanel({ driver }: { driver: Driver }) {
    const [addresses, setAddresses] = useState<QrAddress[]>([]);
    useEffect(() => {
        let cancelled = false;
        void driver
            .getNetworkInfo()
            .then((info) => toQrAddresses(info.addresses))
            .then((qrAddresses) => {
                if (!cancelled) setAddresses(qrAddresses);
            });
        return () => {
            cancelled = true;
        };
    }, [driver]);

    if (!addresses.length) {
        return null;
    }

    return (
        <pre key="Connect other devices">
            <h2>Connect other devices</h2>
            {addresses.map((a) => (
                <div key={a.address} style={{ display: 'inline-block', margin: 10, textAlign: 'center' }}>
                    <img data-id="network-info-qr" src={a.qrDataUrl} alt={`QR code for ${a.url}`} />
                    <div data-id="network-info-url">{a.url}</div>
                </div>
            ))}
        </pre>
    );
}
