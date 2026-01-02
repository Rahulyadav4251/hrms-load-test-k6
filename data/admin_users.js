// data/users.js
export const USERS = Array.from({ length: 99 }, (_, i) => {
    const id = 1100 + i;
    return {
        username: `GSPL-${id}`,
        password: 'GSPL-9',
    };
}).filter(user => user.username !== 'GSPL-1166');
