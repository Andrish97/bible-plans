// Motyw ustawiany przed wczytaniem stylów, żeby strona nie mignęła złym kolorem.
// Zwykły (nie modułowy) skrypt w <head>; reszta obsługi motywu jest w js/ui/theme.js.
try{ const t = localStorage.getItem('plan-motyw'); if(t && t !== 'auto') document.documentElement.dataset.theme = t; }catch(e){}
