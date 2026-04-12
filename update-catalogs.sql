-- Corrige los vehículos que están en el catálogo "0km" pero su condición es de seminuevo, trasladándolos a "importados" (Por pedido).
UPDATE vehicles SET catalog = 'importados' WHERE catalog = '0km' AND condition != '0km';
