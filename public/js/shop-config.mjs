export const SHOP_CATEGORIES=['Shirts','Goal explosions','Goal music','Soccer balls','Boost trails'];
export const SHOP_ITEMS=[
 {id:'shirt:plain',category:'Shirts',name:'Plain White',price:0,kind:'shirt',value:'plain',image:'/images/shirts/shirt1.png'},
 {id:'shirt:inferno',category:'Shirts',name:'Inferno',price:100,kind:'shirt',value:'inferno',image:'/images/shirts/shirt_inferno.png'},
 {id:'shirt:barcelona',category:'Shirts',name:'Barcelona',price:250,kind:'shirt',value:'barcelona',image:'/images/shirts/barcelona.png'},
 {id:'shirt:psg',category:'Shirts',name:'PSG',price:250,kind:'shirt',value:'psg',image:'/images/shirts/psg.png'},
 {id:'effect:classic',category:'Goal explosions',name:'Classic confetti',price:0,kind:'effect',value:'classic'},
 {id:'effect:fire',category:'Goal explosions',name:'Fiery burst',price:100,kind:'effect',value:'fire'},
 {id:'effect:black-hole',category:'Goal explosions',name:'Singularity',price:200,kind:'effect',value:'black-hole'}
];
export const COIN_RULES=Object.freeze({win:12,draw:8,loss:6,goal:3,shot:.5,onTarget:1,pass:.1,cap:40,minimumSeconds:15});
