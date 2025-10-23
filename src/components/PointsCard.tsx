import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Clock, CheckCircle2 } from "lucide-react";

interface PointsCardProps {
  type: "pending" | "redeemable" | "redeemed";
  value: number;
  title: string;
  description: string;
}

export const PointsCard = ({ type, value, title, description }: PointsCardProps) => {
  const icons = {
    pending: <Clock className="h-5 w-5" />,
    redeemable: <TrendingUp className="h-5 w-5" />,
    redeemed: <CheckCircle2 className="h-5 w-5" />,
  };

  const colors = {
    pending: "text-[hsl(var(--points-pending))]",
    redeemable: "text-[hsl(var(--points-redeemable))]",
    redeemed: "text-[hsl(var(--points-redeemed))]",
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className={colors[type]}>{icons[type]}</div>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${colors[type]}`}>
          {value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pontos
        </div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
};
