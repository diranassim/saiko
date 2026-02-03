/**
 * SAIKO - E-commerce JavaScript
 * Version avec Shopify Checkout
 * 
 * CONFIGURATION REQUISE:
 * 1. Créer une boutique Shopify
 * 2. Aller dans Apps → Développer des apps → Créer une app
 * 3. Configurer les accès Storefront API (unauthenticated_read_product_listings, unauthenticated_write_checkouts)
 * 4. Copier le Storefront Access Token et le domaine de ta boutique ci-dessous
 */

// ============================================
// CONFIGURATION SHOPIFY - À MODIFIER
// ============================================
const SHOPIFY_CONFIG = {
    // Remplace par ton domaine Shopify (sans https://)
    domain: 'ta-boutique.myshopify.com',
    
    // Remplace par ton Storefront Access Token
    storefrontAccessToken: 'ton-storefront-access-token-ici',
    
    // IDs des variantes Shopify pour chaque produit
    // Tu les trouves dans Shopify Admin → Produits → [Produit] → URL de la variante
    products: {
        'tanada-hoodie-01': {
            S: 'gid://shopify/ProductVariant/XXXXXXXX',
            M: 'gid://shopify/ProductVariant/XXXXXXXX',
            L: 'gid://shopify/ProductVariant/XXXXXXXX',
            XL: 'gid://shopify/ProductVariant/XXXXXXXX'
        },
        'kiri-tee-01': {
            S: 'gid://shopify/ProductVariant/XXXXXXXX',
            M: 'gid://shopify/ProductVariant/XXXXXXXX',
            L: 'gid://shopify/ProductVariant/XXXXXXXX',
            XL: 'gid://shopify/ProductVariant/XXXXXXXX'
        }
        // Ajoute tes autres produits ici
    }
};

// ============================================
// Shopify Storefront API Client
// ============================================
const ShopifyClient = {
    endpoint: `https://${SHOPIFY_CONFIG.domain}/api/2024-01/graphql.json`,
    
    async query(query, variables = {}) {
        const response = await fetch(this.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Storefront-Access-Token': SHOPIFY_CONFIG.storefrontAccessToken
            },
            body: JSON.stringify({ query, variables })
        });
        return response.json();
    },
    
    // Créer un checkout Shopify
    async createCheckout(lineItems) {
        const query = `
            mutation checkoutCreate($input: CheckoutCreateInput!) {
                checkoutCreate(input: $input) {
                    checkout {
                        id
                        webUrl
                    }
                    checkoutUserErrors {
                        code
                        field
                        message
                    }
                }
            }
        `;
        
        const variables = {
            input: {
                lineItems: lineItems.map(item => ({
                    variantId: item.variantId,
                    quantity: item.quantity
                }))
            }
        };
        
        return this.query(query, variables);
    }
};

// ============================================
// Cart State Management
// ============================================
const Cart = {
    items: [],
    
    init() {
        this.loadFromStorage();
        this.updateUI();
        this.bindEvents();
    },
    
    loadFromStorage() {
        const stored = localStorage.getItem('saiko_cart');
        if (stored) {
            try {
                this.items = JSON.parse(stored);
            } catch (e) {
                this.items = [];
            }
        }
    },
    
    saveToStorage() {
        localStorage.setItem('saiko_cart', JSON.stringify(this.items));
    },
    
    addItem(product) {
        const existingIndex = this.items.findIndex(
            item => item.id === product.id && item.size === product.size
        );
        
        if (existingIndex > -1) {
            this.items[existingIndex].quantity += product.quantity || 1;
        } else {
            this.items.push({
                ...product,
                quantity: product.quantity || 1
            });
        }
        
        this.saveToStorage();
        this.updateUI();
        CartDrawer.open();
    },
    
    removeItem(id, size) {
        this.items = this.items.filter(
            item => !(item.id === id && item.size === size)
        );
        this.saveToStorage();
        this.updateUI();
    },
    
    updateQuantity(id, size, quantity) {
        const item = this.items.find(
            item => item.id === id && item.size === size
        );
        
        if (item) {
            item.quantity = Math.max(1, quantity);
            this.saveToStorage();
            this.updateUI();
        }
    },
    
    getTotal() {
        return this.items.reduce((total, item) => {
            return total + (item.price * item.quantity);
        }, 0);
    },
    
    getItemCount() {
        return this.items.reduce((count, item) => count + item.quantity, 0);
    },
    
    clear() {
        this.items = [];
        this.saveToStorage();
        this.updateUI();
    },
    
    // Convertir le panier local en format Shopify
    getShopifyLineItems() {
        return this.items.map(item => {
            const productVariants = SHOPIFY_CONFIG.products[item.id];
            const variantId = productVariants ? productVariants[item.size] : null;
            
            if (!variantId) {
                console.warn(`Variant ID not found for ${item.id} - ${item.size}`);
                return null;
            }
            
            return {
                variantId: variantId,
                quantity: item.quantity
            };
        }).filter(Boolean);
    },
    
    // Rediriger vers Shopify Checkout
    async checkout() {
        const lineItems = this.getShopifyLineItems();
        
        if (lineItems.length === 0) {
            alert('Impossible de procéder au paiement. Vérifiez la configuration des produits.');
            return;
        }
        
        try {
            // Afficher un loader
            const checkoutBtn = document.querySelector('.cart-summary__checkout, .cart-drawer__buttons .btn:last-child');
            if (checkoutBtn) {
                checkoutBtn.textContent = 'Redirection...';
                checkoutBtn.disabled = true;
            }
            
            const result = await ShopifyClient.createCheckout(lineItems);
            
            if (result.data?.checkoutCreate?.checkout?.webUrl) {
                // Rediriger vers le checkout Shopify
                window.location.href = result.data.checkoutCreate.checkout.webUrl;
            } else {
                console.error('Checkout error:', result);
                alert('Erreur lors de la création du panier. Réessayez.');
                if (checkoutBtn) {
                    checkoutBtn.textContent = 'Passer au paiement';
                    checkoutBtn.disabled = false;
                }
            }
        } catch (error) {
            console.error('Checkout error:', error);
            alert('Erreur de connexion. Réessayez.');
        }
    },
    
    updateUI() {
        // Update cart count in header
        const cartCountElements = document.querySelectorAll('.header__cart-count, .cart-count');
        cartCountElements.forEach(el => {
            el.textContent = this.getItemCount();
            el.style.display = this.getItemCount() > 0 ? 'flex' : 'none';
        });
        
        // Update cart drawer
        CartDrawer.render();
        
        // Update cart page if on cart page
        CartPage.render();
    },
    
    bindEvents() {
        // Add to cart buttons
        document.querySelectorAll('[data-add-to-cart]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const productData = this.getProductDataFromButton(btn);
                if (productData) {
                    this.addItem(productData);
                }
            });
        });
        
        // Checkout buttons - redirect to Shopify
        document.querySelectorAll('[data-checkout], .cart-summary__checkout').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.checkout();
            });
        });
    },
    
    getProductDataFromButton(btn) {
        const container = btn.closest('[data-product]');
        if (!container) return null;
        
        const selectedSize = document.querySelector('.size-selector__btn.active');
        
        return {
            id: container.dataset.productId || Date.now().toString(),
            name: container.dataset.productName || 'Produit',
            price: parseFloat(container.dataset.productPrice) || 0,
            image: container.dataset.productImage || '',
            size: selectedSize ? selectedSize.dataset.size : 'M',
            quantity: 1
        };
    }
};

// ============================================
// Cart Drawer (Overlay)
// ============================================
const CartDrawer = {
    drawer: null,
    overlay: null,
    
    init() {
        this.drawer = document.querySelector('.cart-drawer');
        this.overlay = document.querySelector('.cart-drawer__overlay');
        
        if (!this.drawer || !this.overlay) {
            this.createDrawer();
        }
        
        this.bindEvents();
    },
    
    createDrawer() {
        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'cart-drawer__overlay';
        document.body.appendChild(this.overlay);
        
        // Create drawer
        this.drawer = document.createElement('div');
        this.drawer.className = 'cart-drawer';
        this.drawer.innerHTML = `
            <div class="cart-drawer__header">
                <span class="cart-drawer__title">Panier</span>
                <button class="cart-drawer__close" aria-label="Fermer">&times;</button>
            </div>
            <div class="cart-drawer__items"></div>
            <div class="cart-drawer__footer">
                <div class="cart-drawer__total">
                    <span>Total</span>
                    <span class="cart-drawer__total-value">0 €</span>
                </div>
                <div class="cart-drawer__buttons">
                    <a href="cart.html" class="btn btn--outline">Voir le panier</a>
                    <button class="btn" data-checkout>Paiement</button>
                </div>
            </div>
        `;
        document.body.appendChild(this.drawer);
    },
    
    bindEvents() {
        // Close button
        const closeBtn = this.drawer?.querySelector('.cart-drawer__close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }
        
        // Overlay click
        if (this.overlay) {
            this.overlay.addEventListener('click', () => this.close());
        }
        
        // Cart button in header
        document.querySelectorAll('.header__cart, [data-open-cart]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggle();
            });
        });
        
        // Checkout button in drawer
        const checkoutBtn = this.drawer?.querySelector('[data-checkout]');
        if (checkoutBtn) {
            checkoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                Cart.checkout();
            });
        }
        
        // Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.drawer?.classList.contains('is-open')) {
                this.close();
            }
        });
    },
    
    open() {
        if (this.drawer && this.overlay) {
            this.drawer.classList.add('is-open');
            this.overlay.classList.add('is-visible');
            document.body.classList.add('no-scroll');
        }
    },
    
    close() {
        if (this.drawer && this.overlay) {
            this.drawer.classList.remove('is-open');
            this.overlay.classList.remove('is-visible');
            document.body.classList.remove('no-scroll');
        }
    },
    
    toggle() {
        if (this.drawer?.classList.contains('is-open')) {
            this.close();
        } else {
            this.open();
        }
    },
    
    render() {
        if (!this.drawer) return;
        
        const itemsContainer = this.drawer.querySelector('.cart-drawer__items');
        const totalElement = this.drawer.querySelector('.cart-drawer__total-value');
        const footer = this.drawer.querySelector('.cart-drawer__footer');
        
        if (!itemsContainer) return;
        
        if (Cart.items.length === 0) {
            itemsContainer.innerHTML = `
                <div class="cart-drawer__empty">
                    <p class="cart-drawer__empty-text">Votre panier est vide</p>
                    <a href="shop.html" class="btn btn--small">Découvrir la collection</a>
                </div>
            `;
            if (footer) footer.style.display = 'none';
        } else {
            itemsContainer.innerHTML = Cart.items.map(item => `
                <div class="cart-drawer__item" data-item-id="${item.id}" data-item-size="${item.size}">
                    <div class="cart-drawer__item-image">
                        <img src="${item.image}" alt="${item.name}">
                    </div>
                    <div class="cart-drawer__item-info">
                        <span class="cart-drawer__item-name">${item.name}</span>
                        <span class="cart-drawer__item-details">Taille: ${item.size} | Qté: ${item.quantity}</span>
                        <span class="cart-drawer__item-price">${item.price} €</span>
                    </div>
                </div>
            `).join('');
            
            if (footer) footer.style.display = 'block';
            if (totalElement) totalElement.textContent = `${Cart.getTotal()} €`;
        }
    }
};

// ============================================
// Cart Page
// ============================================
const CartPage = {
    container: null,
    
    init() {
        this.container = document.querySelector('.cart-items');
        if (this.container) {
            this.bindEvents();
            this.render();
        }
    },
    
    bindEvents() {
        if (!this.container) return;
        
        // Delegate events for quantity and remove buttons
        this.container.addEventListener('click', (e) => {
            const target = e.target;
            const item = target.closest('.cart-item');
            
            if (!item) return;
            
            const id = item.dataset.itemId;
            const size = item.dataset.itemSize;
            const quantityEl = item.querySelector('.quantity-selector__value');
            const currentQuantity = parseInt(quantityEl?.textContent || '1');
            
            if (target.classList.contains('quantity-decrease')) {
                Cart.updateQuantity(id, size, currentQuantity - 1);
            } else if (target.classList.contains('quantity-increase')) {
                Cart.updateQuantity(id, size, currentQuantity + 1);
            } else if (target.classList.contains('cart-item__remove')) {
                Cart.removeItem(id, size);
            }
        });
    },
    
    render() {
        if (!this.container) return;
        
        const summaryTotal = document.querySelector('.cart-summary__total-value');
        const summarySubtotal = document.querySelector('.cart-summary__subtotal-value');
        
        if (Cart.items.length === 0) {
            this.container.innerHTML = '';
            const cartLayout = document.querySelector('.cart-layout');
            if (cartLayout) {
                cartLayout.innerHTML = `
                    <div class="cart-empty">
                        <h2 class="cart-empty__title">Votre panier est vide</h2>
                        <p class="cart-empty__text">Découvrez notre collection et trouvez votre pièce.</p>
                        <a href="shop.html" class="btn">Voir la boutique</a>
                    </div>
                `;
            }
        } else {
            this.container.innerHTML = Cart.items.map(item => `
                <div class="cart-item" data-item-id="${item.id}" data-item-size="${item.size}">
                    <div class="cart-item__image">
                        <img src="${item.image}" alt="${item.name}">
                    </div>
                    <div class="cart-item__info">
                        <h3 class="cart-item__name">${item.name}</h3>
                        <p class="cart-item__variant">Taille: ${item.size}</p>
                        <p class="cart-item__price">${item.price} €</p>
                    </div>
                    <div class="cart-item__actions">
                        <div class="quantity-selector">
                            <button class="quantity-selector__btn quantity-decrease">−</button>
                            <span class="quantity-selector__value">${item.quantity}</span>
                            <button class="quantity-selector__btn quantity-increase">+</button>
                        </div>
                        <button class="cart-item__remove">Supprimer</button>
                    </div>
                </div>
            `).join('');
            
            if (summaryTotal) summaryTotal.textContent = `${Cart.getTotal()} €`;
            if (summarySubtotal) summarySubtotal.textContent = `${Cart.getTotal()} €`;
        }
    }
};

// ============================================
// Size Selector
// ============================================
const SizeSelector = {
    init() {
        document.querySelectorAll('.size-selector').forEach(selector => {
            selector.addEventListener('click', (e) => {
                if (e.target.classList.contains('size-selector__btn')) {
                    selector.querySelectorAll('.size-selector__btn').forEach(btn => {
                        btn.classList.remove('active');
                    });
                    e.target.classList.add('active');
                }
            });
        });
    }
};

// ============================================
// Mobile Navigation
// ============================================
const MobileNav = {
    toggle: null,
    nav: null,
    
    init() {
        this.toggle = document.querySelector('.header__menu-toggle');
        this.nav = document.querySelector('.mobile-nav');
        
        if (this.toggle && this.nav) {
            this.toggle.addEventListener('click', () => {
                this.nav.classList.toggle('is-open');
                document.body.classList.toggle('no-scroll');
            });
            
            // Close on link click
            this.nav.querySelectorAll('.mobile-nav__link').forEach(link => {
                link.addEventListener('click', () => {
                    this.nav.classList.remove('is-open');
                    document.body.classList.remove('no-scroll');
                });
            });
        }
    }
};

// ============================================
// Initialize
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    Cart.init();
    CartDrawer.init();
    CartPage.init();
    SizeSelector.init();
    MobileNav.init();
});

// Expose to window
window.SAIKO = {
    Cart,
    CartDrawer,
    ShopifyClient
};
