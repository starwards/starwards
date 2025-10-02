## TypeScript Best Practices
- Use strict mode
- Prefer type inference for return types; avoid explicit declarations
- Always type function arguments; use interfaces for complex types
- Derive types from existing ones using `Omit`, `Pick`, unions when semantically related
- Avoid the `any` type; use `unknown` when type is uncertain
- Use proper React event types (`React.MouseEvent`, `React.ChangeEvent`)
- Treat types as tests - nothing more, nothing less

## OOP Best Practices
- Consider opting to literal objects over classes
    - The type of the instance can be derived just the same
    - Some nominal OOP patterns are not required (Singleton)
    - the code is easier to change.
    
## React Best Practices
- Always use functional components with hooks
- Use `React.FC` for component definitions
- Implement proper error boundaries
- Use `React.memo` for performance optimization
- Prefer composition over inheritance

## Components
- Keep components small and focused
- Use TypeScript interfaces for props
- Use `useState` and `useEffect` with proper dependency arrays
- Use `useCallback` and `useMemo` for expensive operations
- Prefer controlled components over uncontrolled

## State Management
- Use `useState` for local component state
- Use `useReducer` for complex state logic
- Use custom hooks for reusable stateful logic
- Keep state transformations pure and predictable

## JSX/Templates
- Keep JSX simple and avoid complex inline logic
- Use proper event handlers with correct typing
- Use conditional rendering with `&&` or ternary operators
- Use `key` props for dynamic lists
- Use semantic HTML elements

## Services/Utilities
- Design functions around single responsibility
- Use pure functions when possible  
- Type all function parameters
- Use custom hooks for API calls and side effects

## Code Organization
- Keep files under 200 lines; refactor at 500 lines maximum
- Use concise expressions to minimize verbosity
- Avoid code documentation except for explaining *why*, not *what*