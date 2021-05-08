import React, { ReactNode } from 'react';

type RepeaterProps<T> = {
    data: Iterable<T>;
    children: (i: T) => ReactNode;
};
export function Repeater<T>({ data, children }: RepeaterProps<T>) {
    const elements = [];
    for (const item of data) {
        elements.push(children(item));
    }
    return <>{elements}</>;
}
