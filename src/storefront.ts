import {createStorefrontApiClient, StorefrontApiClient} from "@shopify/storefront-api-client";
import {
    Cart,
    CartLine,
    ComponentizableCartLine,
    MoneyV2,
    Mutation
} from "../types/storefront-api-types";

interface ShopifyConfig {
    $cart?: string | false
    $checkout?: string | false
    $count?: string | false
    $link?: string | false
    $lines?: string | false
    $quantity?: string | false
    $subtotal?: string | false
    $total?: string | false
    apiVersion?: string;
    errorClass?: string
    isEmptyClass?: string
    isLoadingClass?: string
    itemTemplate?: string;
    language?: string
    parent?: ParentNode
    thumbnailMaxWidth?: number
    thumbnailMaxHeight?: number
    storageKey?: string
    useQuantity?: boolean
    timeoutDuration?: number,
}

// noinspection JSUnusedGlobalSymbols
export default class Shopify implements ShopifyConfig {
    $cart = 'shopify-cart';
    $count = 'shopify-count';
    $checkout = 'shopify-checkout';
    $lines = 'shopify-lines'
    $link = 'shopify-link'
    $quantity = '[data-shopify-quantity]';
    $subtotal = 'shopify-subtotal';
    $total = 'shopify-total';
    apiVersion = '2025-01';
    cartId!: string | null;
    cart!: Cart;
    client!: StorefrontApiClient;
    errorClass: string = 'error';
    isEmptyClass: string = 'is-empty';
    isLoadingClass: string = 'is-loading';
    lineCount: number = 0;
    totalQuantity: number = 0;
    itemTemplate: string | undefined;
    parent = document;
    storageKey: string = 'shopifyCartId';
    language: string | undefined;
    thumbnailMaxWidth: number = 200;
    thumbnailMaxHeight: number = 200;
    timeout: number | undefined;
    timeoutDuration = 500;
    useQuantity: boolean = false;

    constructor(domain: string, token: string, config: ShopifyConfig = {}) {
        const shopify = this;

        Object.assign(shopify, {
            language: document.documentElement.lang || null,
            ...config
        });

        shopify.client = createStorefrontApiClient({
            apiVersion: shopify.apiVersion,
            storeDomain: domain,
            publicAccessToken: token,
        });

        shopify.cartId = localStorage.getItem(shopify.storageKey);

        shopify.loadCart().then(() => shopify.afterInit());
    }

    private async loadCart(): Promise<void> {
        const shopify = this;
        const operation = `fragment CartFragment on Cart { id createdAt updatedAt lines(first: 20) { nodes { ...CartLineFragment } pageInfo { hasNextPage hasPreviousPage } } attributes { key value } cost { totalAmount { amount currencyCode } subtotalAmount { amount currencyCode } totalTaxAmount { amount currencyCode } totalDutyAmount { amount currencyCode } } checkoutUrl discountCodes { applicable code } discountAllocations { discountedAmount { amount currencyCode } discountApplication { targetType allocationMethod targetSelection value { ... on PricingPercentageValue { percentage } ... on MoneyV2 { amount currencyCode } } } ... on CartCodeDiscountAllocation { code } ... on CartAutomaticDiscountAllocation { title } ... on CartCustomDiscountAllocation { title } } appliedGiftCards { ...AppliedGiftCardFragment } note } fragment CartLineFragment on CartLine { id merchandise { ... on ProductVariant { id title image { thumbnail: url(transform: { maxWidth: ${shopify.thumbnailMaxWidth}, maxHeight: ${shopify.thumbnailMaxHeight}, }) url altText width height } product { id handle title } weight availableForSale sku selectedOptions { name value } compareAtPrice { amount currencyCode } price { amount currencyCode } unitPrice { amount currencyCode } unitPriceMeasurement { measuredType quantityUnit quantityValue referenceUnit referenceValue } } } quantity attributes { key value } cost { totalAmount { amount currencyCode } subtotalAmount { amount currencyCode } amountPerQuantity { amount currencyCode } compareAtAmountPerQuantity { amount currencyCode } } discountAllocations { discountedAmount { amount currencyCode } discountApplication { targetType allocationMethod targetSelection value { ... on PricingPercentageValue { percentage } ... on MoneyV2 { amount currencyCode } } } ... on CartCodeDiscountAllocation { code } ... on CartAutomaticDiscountAllocation { title } ... on CartCustomDiscountAllocation { title } } } fragment AppliedGiftCardFragment on AppliedGiftCard { amountUsed { amount currencyCode } amountUsedV2: amountUsed { amount currencyCode } balance { amount currencyCode } balanceV2: balance { amount currencyCode } presentmentAmountUsed { amount currencyCode } id lastCharacters } query CartQuery($cartId: ID!) { cart(id: $cartId) { ...CartFragment } }`;

        if (!shopify.cartId) {
            return shopify.createCart();
        }

        return shopify.request(operation, {
            variables: {
                cartId: shopify.cartId,
            }
        }).then(({cart}: { cart: Cart | null }) => {
            if (!cart) {
                return shopify.createCart();
            }

            shopify.cart = cart;
            shopify.lineCount = cart.lines.nodes.length || 0;

            shopify.totalQuantity = shopify.lineCount
                ? cart.lines.nodes.reduce((total: number, line) => total + line.quantity, 0)
                : 0;

            shopify.updateCart();
        });
    }

    private async createCart(): Promise<void> {
        const shopify = this;
        const operation = `mutation createCart($i: CartInput) { cartCreate(input: $i) { cart { id checkoutUrl } } }`;

        return shopify.request(operation).then((data: Mutation) => {
            const cart = data.cartCreate!.cart || null;

            if (cart) {
                shopify.cartId = cart.id;
                localStorage.setItem(shopify.storageKey, cart.id);
                return shopify.loadCart();
            }
        });
    }

    async addLine(variantId: string, quantity: number = 1): Promise<void> {
        const shopify = this;
        const operation = 'mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) { cartLinesAdd(cartId: $cartId, lines: $lines) { cart { id } } }';

        shopify.setLoading(true);

        return shopify.request(operation, {
            variables: {
                cartId: shopify.cartId,
                lines: [
                    {
                        merchandiseId: `gid://shopify/ProductVariant/${variantId}`,
                        quantity: quantity
                    }
                ]
            }
        }).then(() => shopify.loadCart());
    }

    updateLine(lineItemId: string, quantity: number): Promise<void> {
        return this.cartLinesUpdate(this.cart.lines.nodes.map((item: any) => ({
            id: item.id,
            quantity: item.id === lineItemId ? quantity : item.quantity
        })));
    }

    private async cartLinesUpdate(lines: any): Promise<void> {
        const shopify = this;
        const operation = "mutation cartLinesUpdate( $cartId: ID! $lines: [CartLineUpdateInput!]! ) { cartLinesUpdate(cartId: $cartId, lines: $lines) { cart { id } } }";

        return shopify.request(operation, {
            variables: {
                cartId: shopify.cartId,
                lines: lines,
            }
        }).then(() => shopify.loadCart());
    }

    removeLine(lineItemId: string): Promise<void> {
        return this.updateLine(lineItemId, 0);
    }

    clearLines(): Promise<void> {
        return this.cartLinesUpdate(this.cart.lines.nodes.map((item: any) => ({
            id: item.id,
            quantity: 0
        })));
    }

    afterInit(): void {
        this.renderCart();
    }

    onQuantityChange = ($input: HTMLInputElement): void => {
        const shopify = this;

        const callback = () => {
            shopify.setLoading(true);
            void shopify.updateLine($input.dataset.id!, Math.max(parseInt($input.value), 0));
            console.log('Quantity changed');
        };

        clearTimeout(shopify.timeout);
        shopify.timeout = window.setTimeout(callback, shopify.timeoutDuration);
    }

    renderCart(): void {
        const shopify = this;

        shopify.updateCart();
        shopify.renderCheckout();
    }

    updateCart(): void {
        const shopify = this;

        shopify.toggleEmpty();

        shopify.renderCartCount();
        shopify.renderLines();
        shopify.renderTotals();

        shopify.setLoading();
    }

    renderCartCount(): void {
        const shopify = this;
        const count = shopify.useQuantity ? shopify.totalQuantity : shopify.lineCount;

        shopify.queryAll(shopify.$count, ($el) => $el.innerHTML = count.toString());
        shopify.queryAll(shopify.$link, ($el) => $el.style.display = count > 0 ? 'block' : 'none');
    }

    renderCheckout(): void {
        const shopify = this;

        shopify.queryAll(shopify.$checkout, ($el) => $el.onclick = () => {
            if (shopify.lineCount) {
                location.href = shopify.cart.checkoutUrl;
            }
        });
    }

    renderLines(): void {
        const shopify = this;

        shopify.queryAll(shopify.$lines, ($items) => {
            let html = '';
            shopify.cart.lines.nodes.forEach((line) => html += shopify.renderLine(line));
            $items.innerHTML = html;
        });

        shopify.queryAll(shopify.$quantity, ($input) => {
            $input.onchange = () => shopify.onQuantityChange($input as HTMLInputElement);
        });
    }

    renderLine(line: CartLine | ComponentizableCartLine): string {
        return this.renderLineTemplate({
            line: line,
        })
    }

    renderTotals(): void {
        const shopify = this;
        const cart = shopify.cart;

        shopify.queryAll(shopify.$subtotal, ($el) => {
            return $el.innerHTML = cart ? shopify.formatPrice(cart.cost.subtotalAmount) : '';
        });

        shopify.queryAll(shopify.$total, ($el) => {
            return $el.innerHTML = cart ? shopify.formatPrice(cart.cost.totalAmount) : '';
        });
    }

    renderLineTemplate(params: object): string {
        return new Function("return `" + this.itemTemplate + "`;").call(params);
    }

    renderError(error ?: string): void {
        const shopify = this;
        const message = error || 'An unknown error occurred';

        shopify.queryAll(shopify.$lines, ($lines) => {
            $lines.innerHTML = `<div class="${shopify.errorClass}">${message}</div>${$lines.innerHTML}`;
        })
    }

    toggleEmpty(): void {
        const shopify = this;
        shopify.queryAll(shopify.$cart, ($el) => $el.classList.toggle(shopify.isEmptyClass, !shopify.lineCount));
    }

    setLoading(value: boolean = false): void {
        const shopify = this;

        shopify.queryAll(shopify.$cart, ($cart) => {
            $cart.classList[value ? 'add' : 'remove'](shopify.isLoadingClass);
        });
    }

    formatPrice = (money: MoneyV2): string => {
        const currency = money.currencyCode == 'EUR' ? '€' : money.currencyCode;
        return parseFloat(money.amount).toLocaleString(this.language || undefined, {minimumFractionDigits: 2}) + ' ' + currency;
    }

    async request(operation: string, params?: object): Promise<any> {
        return this.client.request(operation, params)
            .then(({errors, data}: any) => {
                if (errors) {
                    console.error(errors.graphQLErrors);
                    this.renderError(errors.message);
                }

                return data || {};
            });
    }

    queryAll = (
        selector: string | false,
        callback?: (value: HTMLElement, key?: number, parent?: NodeListOf<HTMLElement>) => void
    ): NodeListOf<HTMLElement> | void => {
        if (selector) {
            const $list = this.parent.querySelectorAll(selector) as NodeListOf<HTMLElement>;

            if (callback) {
                $list.forEach(callback)
            }

            return $list;
        }
    };
}
