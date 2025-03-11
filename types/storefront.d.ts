import { StorefrontApiClient } from "@shopify/storefront-api-client";
import { Cart, CartLine, MoneyV2 } from "./storefront-api-types";
interface ShopifyConfig {
    $cartCount?: HTMLElement;
    $cart?: HTMLElement;
    $items?: HTMLElement;
    $subtotal?: HTMLElement;
    errorClass?: string;
    isEmptyClass?: string;
    isLoadingClass?: string;
    language?: string;
    thumbnailMaxWidth?: number;
    thumbnailMaxHeight?: number;
    storageKey?: string;
}
export default class Shopify {
    $cart: HTMLElement;
    $cartCount: HTMLElement;
    $items: HTMLElement;
    $subtotal: HTMLElement;
    cartId: string | null;
    cart: Cart;
    client: StorefrontApiClient;
    errorClass: string;
    isEmptyClass: string;
    isLoadingClass: string;
    itemCount: number;
    itemTemplate: string;
    storageKey: string;
    language: string;
    thumbnailMaxWidth: number;
    thumbnailMaxHeight: number;
    constructor(domain: string, token: string, config?: ShopifyConfig);
    afterInit(): void;
    request(operation: string, params?: object): Promise<any>;
    updateCart(): Promise<any>;
    createCart(): void;
    updateItemCount(): void;
    afterCartUpdate(): void;
    onLineCountChange(): void;
    updateCartCount(count: number): void;
    addLine(variantId: string, quantity?: number): void;
    updateLine(lineItemId: string, quantity: number): Promise<any>;
    private cartLinesUpdate;
    removeLine(lineItemId: string): Promise<any>;
    clearLines(): Promise<any>;
    render(): void;
    renderLine(item: CartLine): string;
    renderLineTemplate(params: object): string;
    renderError(error?: string): void;
    formatPrice: (money: MoneyV2) => string;
}
export {};
//# sourceMappingURL=storefront.d.ts.map