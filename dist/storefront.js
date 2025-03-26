import { createStorefrontApiClient } from "@shopify/storefront-api-client";
export default class Shopify {
    $cart;
    $cartCount;
    $items;
    $subtotal;
    cartId;
    cart;
    client;
    countQuantity;
    errorClass = 'cart-error';
    isEmptyClass = 'is-empty';
    isLoadingClass = 'is-loading';
    itemCount = 0;
    totalQuantity = 0;
    itemTemplate;
    storageKey = 'shopifyCartId';
    language;
    thumbnailMaxWidth = 200;
    thumbnailMaxHeight = 200;
    constructor(domain, token, config = {}) {
        const shopify = this;
        const getById = (id) => document.getElementById(id);
        Object.assign(shopify, {
            $cartCount: getById('cart-count'),
            $cart: getById('cart'),
            $items: getById('items'),
            $subtotal: getById('subtotal'),
            countQuantity: false,
            language: document.documentElement.lang || null,
            ...config
        });
        shopify.itemCount = 0;
        shopify.client = createStorefrontApiClient({
            apiVersion: '2025-01',
            storeDomain: domain,
            publicAccessToken: token,
        });
        shopify.cartId = localStorage.getItem(shopify.storageKey);
        shopify.cart = null;
        shopify.updateCart().then(() => {
            shopify.afterInit();
        });
    }
    afterInit() {
        this.toggleLoading();
    }
    async request(operation, params) {
        return this.client.request(operation, params)
            .then(({ errors, data }) => {
            if (errors) {
                console.error(errors.graphQLErrors);
                this.renderError(errors.message);
            }
            return data || {};
        });
    }
    async updateCart() {
        const shopify = this;
        if (shopify.cartId) {
            const operation = `fragment CartFragment on Cart { id createdAt updatedAt lines(first: 20) { nodes { ...CartLineFragment } pageInfo { hasNextPage hasPreviousPage } } attributes { key value } cost { totalAmount { amount currencyCode } subtotalAmount { amount currencyCode } totalTaxAmount { amount currencyCode } totalDutyAmount { amount currencyCode } } checkoutUrl discountCodes { applicable code } discountAllocations { discountedAmount { amount currencyCode } discountApplication { targetType allocationMethod targetSelection value { ... on PricingPercentageValue { percentage } ... on MoneyV2 { amount currencyCode } } } ... on CartCodeDiscountAllocation { code } ... on CartAutomaticDiscountAllocation { title } ... on CartCustomDiscountAllocation { title } } appliedGiftCards { ...AppliedGiftCardFragment } note } fragment CartLineFragment on CartLine { id merchandise { ... on ProductVariant { id title image { thumbnail: url(transform: { maxWidth: ${shopify.thumbnailMaxWidth}, maxHeight: ${shopify.thumbnailMaxHeight}, }) url altText width height } product { id handle title } weight availableForSale sku selectedOptions { name value } compareAtPrice { amount currencyCode } price { amount currencyCode } unitPrice { amount currencyCode } unitPriceMeasurement { measuredType quantityUnit quantityValue referenceUnit referenceValue } } } quantity attributes { key value } cost { totalAmount { amount currencyCode } subtotalAmount { amount currencyCode } amountPerQuantity { amount currencyCode } compareAtAmountPerQuantity { amount currencyCode } } discountAllocations { discountedAmount { amount currencyCode } discountApplication { targetType allocationMethod targetSelection value { ... on PricingPercentageValue { percentage } ... on MoneyV2 { amount currencyCode } } } ... on CartCodeDiscountAllocation { code } ... on CartAutomaticDiscountAllocation { title } ... on CartCustomDiscountAllocation { title } } } fragment AppliedGiftCardFragment on AppliedGiftCard { amountUsed { amount currencyCode } amountUsedV2: amountUsed { amount currencyCode } balance { amount currencyCode } balanceV2: balance { amount currencyCode } presentmentAmountUsed { amount currencyCode } id lastCharacters } query CartQuery($cartId: ID!) { cart(id: $cartId) { ...CartFragment } }`;
            return shopify.request(operation, {
                variables: {
                    cartId: shopify.cartId,
                }
            }).then(({ cart }) => {
                if (cart) {
                    shopify.cart = cart;
                    shopify.updateItemCount();
                    shopify.afterCartUpdate();
                }
                else {
                    return shopify.createCart();
                }
            });
        }
        return shopify.createCart();
    }
    async createCart() {
        const shopify = this;
        const operation = `mutation createCart($i: CartInput) { cartCreate(input: $i) { cart { id checkoutUrl } } }`;
        return shopify.request(operation).then((data) => {
            const cart = data.cartCreate.cart || null;
            if (cart) {
                shopify.cartId = cart.id;
                localStorage.setItem(shopify.storageKey, cart.id);
            }
        });
    }
    updateItemCount() {
        const shopify = this;
        const itemCount = shopify.cart.lines.nodes.length || 0;
        shopify.totalQuantity = itemCount
            ? shopify.cart.lines.nodes.reduce((total, line) => total + line.quantity, 0)
            : 0;
        if (shopify.itemCount !== itemCount) {
            shopify.itemCount = itemCount;
            shopify.onLineCountChange();
        }
        else if (shopify.countQuantity) {
            shopify.updateCartCount();
        }
    }
    afterCartUpdate() {
        const shopify = this;
        const total = shopify.cart.cost.totalAmount;
        if (shopify.$subtotal) {
            shopify.$subtotal.innerHTML = total ? shopify.formatPrice(total) : '';
        }
        shopify.toggleLoading();
    }
    onLineCountChange() {
        const shopify = this;
        const count = shopify.itemCount;
        if (shopify.$cart) {
            shopify.$cart.classList[count > 0 ? 'remove' : 'add'](shopify.isEmptyClass);
        }
        shopify.updateCartCount();
        shopify.render();
    }
    updateCartCount() {
        const shopify = this;
        const count = shopify.countQuantity ? this.totalQuantity : shopify.itemCount;
        if (shopify.$cartCount) {
            shopify.$cartCount.innerHTML = count.toString();
        }
    }
    addLine(variantId, quantity = 1) {
        const shopify = this;
        const operation = 'mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) { cartLinesAdd(cartId: $cartId, lines: $lines) { cart { id } } }';
        shopify.toggleLoading(true);
        shopify.request(operation, {
            variables: {
                cartId: shopify.cartId,
                lines: [
                    {
                        merchandiseId: `gid://shopify/ProductVariant/${variantId}`,
                        quantity: quantity
                    }
                ]
            }
        })
            .then(() => shopify.updateCart())
            .then(() => shopify.render());
    }
    updateLine(lineItemId, quantity) {
        return this.cartLinesUpdate(this.cart.lines.nodes.map((item) => ({
            id: item.id,
            quantity: item.id === lineItemId ? quantity : item.quantity
        })));
    }
    async cartLinesUpdate(lines) {
        const shopify = this;
        const operation = "mutation cartLinesUpdate( $cartId: ID! $lines: [CartLineUpdateInput!]! ) { cartLinesUpdate(cartId: $cartId, lines: $lines) { cart { id } } }";
        await shopify.request(operation, {
            variables: {
                cartId: shopify.cartId,
                lines: lines,
            }
        });
        return await shopify.updateCart();
    }
    removeLine(lineItemId) {
        return this.updateLine(lineItemId, 0);
    }
    clearLines() {
        return this.cartLinesUpdate(this.cart.lines.nodes.map((item) => ({
            id: item.id,
            quantity: 0
        })));
    }
    toggleLoading(force = false) {
        const shopify = this;
        if (shopify.$cart) {
            shopify.$cart.classList.toggle(shopify.isLoadingClass, force);
        }
    }
    render() {
        const shopify = this;
        if (shopify.$items) {
            shopify.$items.innerHTML = '';
            shopify.cart.lines.nodes.forEach((line) => shopify.$items.innerHTML += shopify.renderLine(line));
        }
    }
    renderLine(item) {
        return this.renderLineTemplate({
            item: item,
        });
    }
    renderLineTemplate(params) {
        return new Function("return `" + this.itemTemplate + "`;").call(params);
    }
    renderError(error) {
        const shopify = this;
        const message = error || 'An unknown error occurred';
        if (shopify.$items) {
            shopify.$items.innerHTML = `<div class="${shopify.errorClass}">${message}</div>${shopify.$items.innerHTML}`;
        }
    }
    formatPrice = (money) => {
        const currency = money.currencyCode == 'EUR' ? '€' : money.currencyCode;
        return parseFloat(money.amount).toLocaleString(this.language || undefined, { minimumFractionDigits: 2 }) + ' ' + currency;
    };
}
