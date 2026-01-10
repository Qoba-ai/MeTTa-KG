interface NotImplementedProps {
  name: string;
}

export default function NotImplemented({ name }: NotImplementedProps) {
  return (
    <div class="w-full h-full flex items-center justify-center">
      <h1 class="text-foreground">{name} Is Coming Soon ⏰</h1>
    </div>
  );
}
