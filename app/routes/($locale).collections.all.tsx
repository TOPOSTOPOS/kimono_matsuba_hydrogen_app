import {redirect, type LoaderFunctionArgs} from '@shopify/remix-oxygen';

export async function loader({params, request}: LoaderFunctionArgs) {
  // 並び順などのクエリパラメータを引き継いでリダイレクトする
  const {search} = new URL(request.url);
  const path = params?.locale ? `${params.locale}/products` : '/products';
  return redirect(`${path}${search}`);
}
