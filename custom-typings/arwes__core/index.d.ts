import '@arwes/core';
declare module '@arwes/core' {
    declare const FrameCorners: import('react').ForwardRefExoticComponent<
        Pick<
            // FrameCornersProps<unknown> &
            import('@arwes/animation/lib/withAnimator/withAnimator').WithAnimatorInputProps,
            | 'children'
            | 'palette'
            | 'rootRef'
            | 'as'
            | 'className'
            | 'disabled'
            | 'hover'
            | 'shapes'
            | 'polylines'
            | 'lineWidth'
            | 'hideShapes'
            | 'hidePolylines'
            | 'effectsRef'
            | 'cornerWidth'
            | 'cornerLength'
            | 'showContentLines'
            | 'contentLineWidth'
        > &
            import('@arwes/animation/lib/withAnimator/withAnimator').WithAnimatorOutputProps &
            import('react').RefAttributes<typeof Component>
    > & {
        defaultProps: Partial<
            Pick<
                // FrameCornersProps<unknown> &
                import('@arwes/animation/lib/withAnimator/withAnimator').WithAnimatorInputProps,
                | 'children'
                | 'palette'
                | 'rootRef'
                | 'as'
                | 'className'
                | 'disabled'
                | 'hover'
                | 'shapes'
                | 'polylines'
                | 'lineWidth'
                | 'hideShapes'
                | 'hidePolylines'
                | 'effectsRef'
                | 'cornerWidth'
                | 'cornerLength'
                | 'showContentLines'
                | 'contentLineWidth'
            > &
                import('@arwes/animation/lib/withAnimator/withAnimator').WithAnimatorOutputProps
        > &
            import('@arwes/animation/lib/withAnimator/withAnimator').WithAnimatorOutputProps;
    };
}
