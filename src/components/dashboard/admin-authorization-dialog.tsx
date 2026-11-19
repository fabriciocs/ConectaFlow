"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type AdminAuthorizationDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAuthorize: (reason: string, totp: string) => void | Promise<void>;
    loading?: boolean;
    actionLabel: string;
};

export function AdminAuthorizationDialog({
    open,
    onOpenChange,
    onAuthorize,
    loading = false,
    actionLabel,
}: AdminAuthorizationDialogProps) {
    const [reason, setReason] = useState("");
    const [totp, setTotp] = useState("");
    const valid = reason.trim().length >= 5 && reason.trim().length <= 240 && /^\d{6}$/.test(totp);

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!valid || loading) return;
        const submittedReason = reason.trim();
        const submittedTotp = totp;
        setReason("");
        setTotp("");
        await onAuthorize(submittedReason, submittedTotp);
    };

    return (
        <Dialog open={open} onOpenChange={loading ? undefined : onOpenChange}>
            <DialogContent>
                <form onSubmit={submit} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle>Confirmação do superadmin</DialogTitle>
                        <DialogDescription>
                            Informe o motivo e o código autenticador para {actionLabel}. A solicitação só será enviada após esta confirmação.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-2">
                        <Label htmlFor="admin-action-reason">Motivo da alteração</Label>
                        <Textarea
                            id="admin-action-reason"
                            value={reason}
                            onChange={(event) => setReason(event.target.value.slice(0, 240))}
                            minLength={5}
                            maxLength={240}
                            placeholder="Descreva por que esta alteração é necessária"
                            required
                            autoFocus
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="admin-action-totp">Código autenticador</Label>
                        <Input
                            id="admin-action-totp"
                            value={totp}
                            onChange={(event) => setTotp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            placeholder="000000"
                            required
                        />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={!valid || loading}>
                            {loading ? "Validando…" : "Confirmar e continuar"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
